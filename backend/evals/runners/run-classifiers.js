#!/usr/bin/env node
/**
 * Classifier Eval Runner
 * Runs classifier behaviors (e.g. hasMathProblem) against hand-authored
 * datasets, paced through the shared pacer/report/resume libs. Sequential
 * execution only - no concurrency - so pacing and retry accounting stay simple.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

import { createPacer } from './lib/pacer.js';
import { createReport } from './lib/report.js';
import { loadCompleted } from './lib/resume.js';
import { openai, TEXT_MODEL, __setChatCompletionOverride } from '../../src/services/openai.js';
import { hasMathProblem, validateProblem, detectMultipleProblems } from '../../src/services/problemService.js';
import { detectFormulaRequirement, evaluateFormulaKnowledge, detectSolutionCompletion } from '../../src/services/socraticEngine.js';
import { gradeTransferAnswer } from '../../src/services/learningAssessmentService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Subset-match: a case passes if every key present in `expected` deep-equals
// the corresponding key in `actual`. Extra fields on `actual` are ignored -
// this lets service functions return richer objects (e.g. reasoning,
// formulaName) without the eval dataset having to pin every field.
export function subsetCompare(expected, actual) {
  if (!actual) return false;
  return Object.keys(expected).every((key) => isDeepStrictEqual(actual[key], expected[key]));
}

// Per-behavior minimum accuracy required for the run to be considered
// passing. Exit code 1 = below threshold, exit code 2 stays reserved for
// quota exhaustion (persistent 429).
export const THRESHOLDS = {
  hasMathProblem: 0.9,
  validateProblem: 0.85,
  detectMultipleProblems: 0.8,
  detectFormulaRequirement: 0.8,
  evaluateFormulaKnowledge: 0.8,
  detectSolutionCompletion: 0.85,
  gradeTransferAnswer: 0.8,
};

// Pure function (no process.exit) so threshold logic is unit-testable.
// Returns per-behavior pass/fail against THRESHOLDS plus an overall exit code
// (0 if every behavior meets its threshold, 1 otherwise).
//
// expectedCounts (optional): map of behavior name -> case count this run
// intended to attempt. A behavior that recorded fewer cases than expected
// (e.g. a run aborted mid-behavior, or a behavior that never got to start
// at all) is forced to fail regardless of the accuracy of the partial
// subset it did complete - a lucky 2/2 on a truncated 20-case behavior must
// never read as a clean PASS. Behaviors present only in expectedCounts (not
// in `behaviors` at all, because zero cases ran) are synthesized with
// total: 0 so they show up as failures instead of being silently invisible.
export function evaluateThresholds(behaviors, thresholds = THRESHOLDS, expectedCounts = {}) {
  const results = {};
  let exitCode = 0;
  const names = new Set([...Object.keys(behaviors), ...Object.keys(expectedCounts)]);
  for (const name of names) {
    const b = behaviors[name] || { total: 0, accuracy: 0 };
    const threshold = thresholds[name];
    const expected = expectedCounts[name];
    const incomplete = expected !== undefined && b.total < expected;
    const pass = incomplete ? false : (threshold === undefined ? true : b.accuracy >= threshold);
    results[name] = { accuracy: b.accuracy, threshold, pass, total: b.total, expected, incomplete };
    if (!pass) exitCode = 1;
  }
  return { results, exitCode };
}

export const BEHAVIORS = {
  hasMathProblem: {
    dataset: path.join(ROOT, 'datasets', 'classifiers', 'hasMathProblem.json'),
    invoke: async (input) => {
      const result = await hasMathProblem(input.text);
      return { hasMath: result.hasMath };
    },
    compare: subsetCompare,
  },
  validateProblem: {
    dataset: path.join(ROOT, 'datasets', 'classifiers', 'validateProblem.json'),
    invoke: async (input) => {
      const result = await validateProblem(input.text);
      return { valid: result.valid };
    },
    compare: subsetCompare,
  },
  detectMultipleProblems: {
    dataset: path.join(ROOT, 'datasets', 'classifiers', 'detectMultipleProblems.json'),
    invoke: async (input) => {
      const result = await detectMultipleProblems(input.text);
      const problemCount = result.isMultiple ? result.problems.length : 1;
      return { multiple: result.isMultiple, problemCount };
    },
    compare: subsetCompare,
  },
  detectFormulaRequirement: {
    dataset: path.join(ROOT, 'datasets', 'classifiers', 'detectFormulaRequirement.json'),
    invoke: async (input) => {
      const result = await detectFormulaRequirement(input.problemText, input.category);
      return { requiresFormula: result.requiresFormula };
    },
    compare: subsetCompare,
  },
  evaluateFormulaKnowledge: {
    dataset: path.join(ROOT, 'datasets', 'classifiers', 'evaluateFormulaKnowledge.json'),
    invoke: async (input) => {
      const result = await evaluateFormulaKnowledge(input.studentResponse, input.expectedFormulaName, input.problemText);
      return { knowsFormula: result.knowsFormula };
    },
    compare: subsetCompare,
  },
  detectSolutionCompletion: {
    dataset: path.join(ROOT, 'datasets', 'classifiers', 'detectSolutionCompletion.json'),
    invoke: async (input) => {
      const result = await detectSolutionCompletion(input.studentResponse, input.problem, input.steps || []);
      return { solution_completed: result.solution_completed, is_correct: result.is_correct };
    },
    compare: subsetCompare,
  },
  gradeTransferAnswer: {
    dataset: path.join(ROOT, 'datasets', 'classifiers', 'gradeTransferAnswer.json'),
    invoke: async (input) => {
      const result = await gradeTransferAnswer(input.transferProblem, input.studentAnswer);
      return { is_correct: result.is_correct };
    },
    compare: subsetCompare,
  },
};

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

// Datasets are authored concurrently and may not exist yet at runtime. A
// missing file for a given behavior is a clean per-behavior skip (with a
// warning), never a crash of the whole runner.
function loadDataset(name) {
  const { dataset } = BEHAVIORS[name];
  if (!fs.existsSync(dataset)) {
    console.warn(`Warning: dataset for behavior "${name}" not found at ${dataset} - skipping.`);
    return null;
  }
  return JSON.parse(fs.readFileSync(dataset, 'utf8'));
}

function loadCases(args) {
  const behaviorNames = args.filter && BEHAVIORS[args.filter] ? [args.filter] : Object.keys(BEHAVIORS);
  let cases = [];
  for (const name of behaviorNames) {
    const dataset = loadDataset(name);
    if (!dataset) continue;
    for (const c of dataset) {
      cases.push({ behavior: name, ...c });
    }
  }

  // If filter isn't a known behavior name, treat it as a caseId prefix filter.
  if (args.filter && !BEHAVIORS[args.filter]) {
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

export async function runCase(behaviorDef, testCase, pacer, { backoffMs = 60000 } = {}) {
  let lastActual = null;
  let lastError = null;
  let calls = 0;
  let pass = false;
  const start = Date.now();

  // At most one attempt, plus one backoff-retry if the first attempt hits a
  // persistent 429 (survived createChatCompletion's own fallback). A wrong
  // (non-erroring) answer ends the case immediately - it is NOT retried.
  // Retrying on mismatch would let failing cases "re-roll" for a lucky flip
  // while first-try passes never get re-rolled, biasing accuracy upward and
  // contradicting the pass = first-attempt-success contract below.
  for (let attempt = 0; attempt < 2; attempt++) {
    calls += 1;
    try {
      const actual = await behaviorDef.invoke(testCase.input);
      lastActual = actual;
      pass = behaviorDef.compare(testCase.expected, actual);
      lastError = null;
      break;
    } catch (error) {
      const status = error?.status ?? error?.response?.status;
      if (status === 429 && attempt === 0) {
        // Persistent 429 that survived the createChatCompletion fallback:
        // back off once, then retry this case exactly once more.
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      if (status === 429) {
        // Second consecutive 429 after the backoff retry: give up on this
        // case and let the caller (main) decide the run's fate.
        throw error;
      }
      lastError = error.message || String(error);
      pass = false;
      break;
    }
  }

  const ms = Date.now() - start;

  return {
    behavior: testCase.behavior,
    id: testCase.id,
    pass,
    samples: [pass],
    expected: testCase.expected,
    actual: lastActual,
    error: lastError,
    calls,
    ms,
  };
}

// argv/{ rawCall, backoffMs } are only ever supplied by tests: argv lets a
// test drive the CLI without touching process.argv, rawCall/backoffMs let a
// test simulate 429s and skip the real 60s sleep without hitting the
// network. Production invocation (`node run-classifiers.js`) uses the
// defaults below, which are exactly the previous hardcoded behavior.
export async function main(argv = process.argv.slice(2), { rawCall, backoffMs } = {}) {
  const args = parseArgs(argv);
  const cases = loadCases(args);

  const models = [TEXT_MODEL];
  console.log(`Projected call count: ${cases.length} case(s) (up to ${cases.length * 2} LLM calls with retries)`);
  console.log(`Model(s): ${models.join(', ')}`);
  console.log(`RPM: ${args.rpm}`);

  if (args.dryRun) {
    console.log('Dry run - no calls will be made. Exiting.');
    return;
  }

  if (!args.yes) {
    const confirmed = await promptYesNo(`Proceed with up to ${cases.length * 2} live LLM calls? (y/N) `);
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

  // Cases this invocation actually intends to attempt (excludes anything a
  // --resume already has recorded), grouped by behavior. Used below to catch
  // a run that stops early - whether mid-behavior or before a later behavior
  // ever starts - so a partial result can never be mistaken for a complete,
  // passing one.
  const expectedCounts = {};
  for (const c of cases) {
    if (completed.has(c.id)) continue;
    expectedCounts[c.behavior] = (expectedCounts[c.behavior] || 0) + 1;
  }

  __setChatCompletionOverride(async (params) => {
    await pacer.wait();
    pacer.count(params.model);
    return (rawCall || ((p) => openai.chat.completions.create(p)))(params);
  });

  let exitCode = 0;
  try {
    for (let i = 0; i < cases.length; i++) {
      const testCase = cases[i];
      if (completed.has(testCase.id)) continue;

      const behaviorDef = BEHAVIORS[testCase.behavior];
      try {
        const result = await runCase(behaviorDef, testCase, pacer, { backoffMs });
        report.appendCase(result);
      } catch (error) {
        const status = error?.status ?? error?.response?.status;
        if (status === 429) {
          // Persistent 429: the backoff-retry itself failed again. Stop
          // making calls (quota is presumed exhausted for the whole run,
          // not just this case) and make the incompleteness impossible to
          // miss - both in the console and in the exit code, which always
          // wins over any per-behavior threshold PASS (see below).
          const remaining = cases.slice(i + 1).filter((c) => !completed.has(c.id));
          const remainingInBehavior = remaining.filter((c) => c.behavior === testCase.behavior).length;
          const laterBehaviors = [...new Set(remaining.filter((c) => c.behavior !== testCase.behavior).map((c) => c.behavior))];
          console.error(`Persistent 429 on case ${testCase.id} after backoff. Saving progress and exiting.`);
          console.error(`  ${remainingInBehavior} case(s) not run in behavior "${testCase.behavior}".`);
          if (laterBehaviors.length) {
            console.error(`  Behavior(s) not started at all: ${laterBehaviors.join(', ')}.`);
          }
          console.error(`Resume with: node evals/runners/run-classifiers.js --resume ${runId} --yes`);
          exitCode = 2;
          break;
        }
        report.appendCase({
          behavior: testCase.behavior,
          id: testCase.id,
          pass: false,
          samples: [false],
          expected: testCase.expected,
          actual: null,
          error: error.message || String(error),
          calls: 1,
          ms: 0,
        });
      }
    }
  } finally {
    __setChatCompletionOverride(null);
    const summary = report.finalize({
      runId,
      model: TEXT_MODEL,
      rpm: args.rpm,
      gitCommit: getGitCommit(),
    });
    console.log(`Run complete: ${runDir}`);
    console.log(JSON.stringify(summary.behaviors, null, 2));
    console.log(`Pacer stats: ${JSON.stringify(pacer.stats())}`);

    const thresholdEval = evaluateThresholds(summary.behaviors, undefined, expectedCounts);
    for (const [name, r] of Object.entries(thresholdEval.results)) {
      const status = r.pass ? 'PASS' : r.incomplete ? 'INCOMPLETE' : 'FAIL';
      const incompleteNote = r.incomplete ? ` [only ${r.total}/${r.expected} cases ran]` : '';
      console.log(`${status} ${name}: ${(r.accuracy * 100).toFixed(1)}% (threshold ${((r.threshold ?? 0) * 100).toFixed(1)}%)${incompleteNote}`);
    }
    // Exit code 2 (quota exhaustion) takes priority over threshold failures.
    if (exitCode !== 2) {
      exitCode = thresholdEval.exitCode;
    }
  }

  process.exit(exitCode);
}

// Only run the CLI when this file is executed directly (e.g. `node
// run-classifiers.js`), not when imported by tests for its exported helpers.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
