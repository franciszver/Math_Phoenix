#!/usr/bin/env node
/**
 * E2E Simulation Eval Runner
 * Drives each dataset scenario (backend/evals/datasets/e2e/scenarios.json)
 * turn-by-turn through the real chat-turn services - socraticEngine's
 * processStudentResponse (mirrors chatHandler.js's per-message call) and
 * detectSolutionCompletion (mirrors chatHandler.js's post-step completion
 * check) - accumulating a `steps` array shaped exactly like chatHandler's
 * (each entry is processStudentResponse's `result.step`, unmodified), then
 * scores the scenario against its dataset `expectations` deterministically
 * plus one LLM-judge call on the final tutor message. Mirrors the
 * pacer/report/resume/threshold plumbing established in run-tutor.js /
 * run-classifiers.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

import { createPacer } from './lib/pacer.js';
import { createReport } from './lib/report.js';
import { loadCompleted } from './lib/resume.js';
import { resolveJudgeModel, judgeTutorResponse } from './lib/judge.js';
import { evaluateThresholds } from './run-classifiers.js';
import { leakRegexHit } from './run-tutor.js';
import { openai, TEXT_MODEL, __setChatCompletionOverride } from '../../src/services/openai.js';
import { processStudentResponse, detectSolutionCompletion } from '../../src/services/socraticEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATASET = path.join(ROOT, 'datasets', 'e2e', 'scenarios.json');

// Rough per-turn LLM-call estimate used only for the pre-run projected-call
// print: processStudentResponse issues 1 (generateTutorResponse) + usually 1
// (detectFormulaRequirement, skipped when a rule-based formula pattern
// matches - see socraticEngine.js's formulaPatterns) [+ 1 more,
// evaluateFormulaKnowledge, only on the turn that answers a formula
// question], plus this runner's own detectSolutionCompletion call. Early
// completion (the turn loop breaks as soon as solution_completed is true)
// means the real call count is usually well under this bound.
const CALLS_PER_TURN_ESTIMATE = 3;

export const THRESHOLDS = { e2eSim: 0.75 };

function buildConversationSummary(steps) {
  return steps.map((s) => `Tutor: ${s.tutor_prompt}\nStudent: ${s.student_response}`).join('\n\n');
}

// See run-tutor.js's extractStatus for why both `.status` and
// `.originalError.status` are checked here.
function extractStatus(err) {
  return (
    err?.status ??
    err?.response?.status ??
    err?.originalError?.status ??
    err?.originalError?.response?.status
  );
}

// Pure, dataset-driven pass/fail per declared expectation key. Only keys
// present in `expectations` are evaluated - a scenario that doesn't declare
// e.g. `hintBy` isn't scored on it.
export function computeAssertions(expectations, { completedAtTurn, completedCorrect, hintFiredAtTurn }) {
  const assertions = {};
  if ('completionBy' in expectations) {
    assertions.completionBy = completedAtTurn !== null && completedAtTurn <= expectations.completionBy;
  }
  if ('completedCorrect' in expectations) {
    assertions.completedCorrect = completedAtTurn !== null && completedCorrect === expectations.completedCorrect;
  }
  if ('hintBy' in expectations) {
    assertions.hintBy = hintFiredAtTurn !== null && hintFiredAtTurn <= expectations.hintBy;
  }
  return assertions;
}

export async function runE2eCase(testCase, judgeModel) {
  const { id, persona, problem, known_answer: knownAnswer, script, maxTurns, expectations = {} } = testCase;
  const steps = [];
  let calls = 0;
  let completedAtTurn = null;
  let completedCorrect = null;
  let hintFiredAtTurn = null;
  let finalTutorMessage = null;
  let error = null;
  let errorStatus;

  const turnCap = Math.min(script.length, maxTurns);

  try {
    for (let i = 0; i < turnCap; i++) {
      const turn = i + 1;
      const studentResponse = script[i];

      calls += 1;
      const result = await processStudentResponse({ studentResponse, problem, steps });
      finalTutorMessage = result.tutorMessage;
      // Pushed unmodified, exactly as chatHandler.js does via
      // addStepToProblem(sessionCode, result.step) - same field shape
      // (tutor_prompt, student_response, hint_used, progress_made,
      // stuck_turns, timestamp).
      steps.push(result.step);

      if (hintFiredAtTurn === null && result.step.hint_used) {
        hintFiredAtTurn = turn;
      }

      calls += 1;
      const completion = await detectSolutionCompletion(studentResponse, problem, steps);
      if (completion.solution_completed) {
        completedAtTurn = turn;
        completedCorrect = completion.is_correct;
        break;
      }
    }
  } catch (err) {
    error = err.message || String(err);
    errorStatus = extractStatus(err);
  }

  const assertions = error ? {} : computeAssertions(expectations, { completedAtTurn, completedCorrect, hintFiredAtTurn });

  let judgeVerdict = null;
  // The hard leak check only applies when the scenario never reached
  // completion. If the student already stated the final answer themselves
  // (completedAtTurn set), the tutor's closing message legitimately affirms
  // or restates that same answer - leak-checking it would flag correct
  // tutoring behavior (confirming a student-supplied answer) as a failure.
  const shouldCheckLeak = completedAtTurn === null;
  let judgeHardPass = true;

  if (!error) {
    try {
      calls += 1;
      const conversationSummary = buildConversationSummary(steps.slice(0, -1));
      const lastStudentResponse = script[steps.length - 1];
      judgeVerdict = await judgeTutorResponse({
        problemText: problem.raw_input,
        knownAnswer,
        conversationSummary,
        studentResponse: lastStudentResponse,
        tutorMessage: finalTutorMessage,
        judgeModel,
      });
      if (shouldCheckLeak) {
        const regexHit = leakRegexHit(finalTutorMessage, knownAnswer, problem.raw_input);
        judgeHardPass = judgeVerdict.no_answer_leak && !regexHit;
      }
    } catch (err) {
      error = err.message || String(err);
      errorStatus = extractStatus(err);
    }
  }

  // A generation or judge call that throws is an infra failure, not a
  // pedagogical failure (see run-tutor.js's runTutorCase for the same
  // reasoning) - excluded from accuracy entirely rather than scored as a
  // fail, and errorStatus is surfaced so main() can recognize a persistent
  // 429 and apply the same backoff/resume/exit-2 path run-classifiers.js and
  // run-tutor.js use.
  const excludeFromAccuracy = !!error;
  const pass = excludeFromAccuracy ? false : Object.values(assertions).every(Boolean) && judgeHardPass;

  return {
    behavior: 'e2eSim',
    id,
    persona,
    pass,
    samples: [pass],
    turns: steps.length,
    completedAtTurn,
    hintFiredAtTurn,
    assertions,
    judgeVerdict,
    error,
    errorStatus: excludeFromAccuracy ? errorStatus : undefined,
    excludeFromAccuracy,
    calls,
  };
}

function parseArgs(argv) {
  const args = { rpm: 15 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--filter':
        args.filter = argv[++i];
        break;
      case '--limit':
        args.limit = Number(argv[++i]);
        break;
      case '--rpm':
        args.rpm = Number(argv[++i]);
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--resume':
        args.resume = argv[++i];
        break;
      case '--yes':
        args.yes = true;
        break;
      default:
        // ignore unknown flags
        break;
    }
  }
  return args;
}

function loadDataset() {
  if (!fs.existsSync(DATASET)) {
    console.warn(`Warning: e2e dataset not found at ${DATASET} - skipping.`);
    return [];
  }
  return JSON.parse(fs.readFileSync(DATASET, 'utf8'));
}

function loadCases(args) {
  let cases = loadDataset();
  if (args.filter) {
    cases = cases.filter((c) => c.id.startsWith(args.filter));
  }
  if (args.limit) {
    cases = cases.slice(0, args.limit);
  }
  return cases;
}

function promptYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function projectedCalls(cases) {
  let total = 0;
  for (const c of cases) {
    total += c.maxTurns * CALLS_PER_TURN_ESTIMATE + 1;
  }
  return total;
}

export async function main(argv = process.argv.slice(2), { rawCall, backoffMs = 60000 } = {}) {
  const args = parseArgs(argv);
  const cases = loadCases(args);
  const calls = projectedCalls(cases);

  console.log(
    `Projected call count: ${cases.length} scenario(s), up to ~${calls} LLM calls ` +
      `(each turn: ~${CALLS_PER_TURN_ESTIMATE} calls via processStudentResponse + detectSolutionCompletion, ` +
      `plus 1 judge call per scenario; early completion stops turns short and reduces this).`
  );
  console.log(`Model(s): ${TEXT_MODEL}`);
  console.log(`RPM: ${args.rpm}`);

  if (args.dryRun) {
    console.log('Dry run - no calls will be made. Exiting.');
    return;
  }

  if (!args.yes) {
    const confirmed = await promptYesNo(`Proceed with up to ${calls} live LLM calls? (y/N) `);
    if (!confirmed) {
      console.log('Aborted.');
      process.exit(1);
    }
  }

  const runId = args.resume || `${Date.now()}`;
  const runDir = path.join(ROOT, 'reports', 'runs', runId);
  const report = createReport(runDir);
  const completed = args.resume ? loadCompleted(runDir) : new Set();
  const pacer = createPacer(args.rpm);
  const judgeModel = resolveJudgeModel(TEXT_MODEL);

  const expectedCounts = { e2eSim: cases.filter((c) => !completed.has(c.id)).length };

  __setChatCompletionOverride(async (params) => {
    await pacer.wait();
    pacer.count(params.model);
    return (rawCall || ((p) => openai.chat.completions.create(p)))(params);
  });

  // Same "persistent 429 => quota exhausted" signal as run-tutor.js /
  // run-classifiers.js: survives one backoff-retry of the same case, still
  // fully errored on 429 after that => stop, save progress, exit 2.
  let quotaExhausted = false;

  try {
    for (const testCase of cases) {
      if (completed.has(testCase.id)) continue;
      let result = await runE2eCase(testCase, judgeModel);

      if (result.excludeFromAccuracy && result.errorStatus === 429) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        result = await runE2eCase(testCase, judgeModel);
        if (result.excludeFromAccuracy && result.errorStatus === 429) {
          report.appendCase(result);
          const remaining = cases.slice(cases.indexOf(testCase) + 1).filter((c) => !completed.has(c.id));
          console.error(`Persistent 429 on case ${testCase.id} after backoff. Saving progress and exiting.`);
          console.error(`  ${remaining.length} case(s) not run.`);
          console.error(`Resume with: node evals/runners/run-e2e.js --resume ${runId} --yes`);
          quotaExhausted = true;
          break;
        }
      }

      report.appendCase(result);
    }
  } finally {
    __setChatCompletionOverride(null);

    const summary = report.finalize({
      runId,
      model: TEXT_MODEL,
      judgeModel,
      rpm: args.rpm,
      gitCommit: getGitCommit(),
    });
    console.log(`Run complete: ${runDir}`);
    console.log(JSON.stringify(summary.behaviors, null, 2));
    console.log(`Pacer stats: ${JSON.stringify(pacer.stats())}`);

    const thresholdEval = evaluateThresholds(summary.behaviors, THRESHOLDS, expectedCounts);
    for (const [name, r] of Object.entries(thresholdEval.results)) {
      const status = r.pass ? 'PASS' : r.incomplete ? 'INCOMPLETE' : 'FAIL';
      const incompleteNote = r.incomplete ? ` [only ${r.total}/${r.expected} cases ran]` : '';
      console.log(`${status} ${name}: ${(r.accuracy * 100).toFixed(1)}% (threshold ${((r.threshold ?? 0) * 100).toFixed(1)}%)${incompleteNote}`);
    }

    process.exitCode = quotaExhausted ? 2 : thresholdEval.exitCode;
  }
}

// Only run the CLI when this file is executed directly (e.g. `node
// run-e2e.js`), not when imported by tests for its exported helpers.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
