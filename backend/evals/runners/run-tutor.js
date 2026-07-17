#!/usr/bin/env node
/**
 * Tutor Eval Runner
 * Runs the tutor-facing behaviors (Socratic tutor responses, MC question
 * generation, transfer-problem generation, similar-problem generation)
 * against hand-authored datasets, paced through the shared pacer/report/
 * resume libs (see run-classifiers.js for the established pattern this
 * mirrors).
 *
 * Signature-mapping decision: the tutorResponse suite calls
 * socraticEngine.generateTutorResponse(context) directly rather than
 * processStudentResponse({studentResponse, problem, steps}). The dataset
 * shape (problem, steps, studentResponse) maps 1:1 onto
 * generateTutorResponse's flat context object (problemText, normalizedLatex,
 * category, studentResponse, conversationHistory). processStudentResponse
 * additionally calls detectFormulaRequirement/evaluateFormulaKnowledge
 * internally, which would add untracked, unpaced LLM calls per case and mix
 * in behaviors already covered by run-classifiers.js - generateTutorResponse
 * keeps the call budget exactly "1 generation call per sample" as specced.
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
import { openai, TEXT_MODEL, __setChatCompletionOverride } from '../../src/services/openai.js';
import { generateTutorResponse } from '../../src/services/socraticEngine.js';
import { generateMCQuestions, generateTransferProblem } from '../../src/services/learningAssessmentService.js';
import { getSimilarProblemOptions } from '../../src/services/problemSimilarityService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SAMPLES_PER_SCENARIO = 2;

// --- Deterministic pre-check (no LLM call) ---------------------------------
// True if `text` contains `knownAnswer` as a standalone (word-bounded)
// number/string, UNLESS that same standalone value already appears in
// `problemRawInput` - numbers restated from the problem statement itself are
// not a leak of the *answer*.
export function leakRegexHit(text, knownAnswer, problemRawInput) {
  if (knownAnswer === undefined || knownAnswer === null || !text) return false;
  const answerStr = String(knownAnswer).trim();
  if (!answerStr) return false;

  const escaped = answerStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Word-char lookaround rather than \b: \b treats the match's own first/
  // last character as one side of the boundary test, which breaks for
  // answers that start with a non-word character - e.g. a negative number
  // like "-4": \b immediately before "-" requires the *preceding* character
  // to be a word char, so "x = -4" (space before "-") never matches even
  // though it plainly leaks the answer. Checking only the neighboring
  // characters (not the match's own edges) fixes that while keeping the
  // same "don't match inside a larger token" behavior (e.g. "4" inside "40").
  const pattern = new RegExp(`(?<!\\w)${escaped}(?!\\w)`, 'i');

  if (!pattern.test(text)) return false;
  if (problemRawInput && pattern.test(problemRawInput)) return false;
  return true;
}

function buildConversationSummary(steps = []) {
  return steps.map((s) => `Tutor: ${s.tutor_prompt}\nStudent: ${s.student_response}`).join('\n\n');
}

// Extract an HTTP status code from a thrown error. judgeTutorResponse throws
// the raw createChatCompletion error unwrapped, so `.status` covers it
// directly. generateTutorResponse (socraticEngine.js) catches that same
// error and rethrows `new OpenAIError('Failed to generate tutor response',
// error)`, which discards `.status` on the wrapper itself but preserves the
// original error on `.originalError` - check there too.
function extractStatus(err) {
  return (
    err?.status ??
    err?.response?.status ??
    err?.originalError?.status ??
    err?.originalError?.response?.status
  );
}

// --- Code-check validators (no LLM call) -----------------------------------

export function validateMcqShape(questions) {
  if (!Array.isArray(questions)) return false;
  if (questions.length < 2 || questions.length > 3) return false;
  return questions.every(
    (q) =>
      q &&
      typeof q.question === 'string' &&
      q.question.trim().length > 0 &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      Number.isInteger(q.correct_answer_index) &&
      q.correct_answer_index >= 0 &&
      q.correct_answer_index < 4
  );
}

export function validateTransferShape(transferProblem, knownAnswer, problemRawInput) {
  if (!transferProblem || typeof transferProblem.problem_text !== 'string') return false;
  if (transferProblem.problem_text.trim().length === 0) return false;
  if (leakRegexHit(transferProblem.problem_text, knownAnswer, problemRawInput)) return false;
  return true;
}

export function validateSimilarShape(options, count = 3) {
  if (!Array.isArray(options)) return false;
  if (options.length > count) return false;
  return options.every(
    (p) =>
      p &&
      typeof p.problemText === 'string' &&
      p.problemText.trim().length > 0 &&
      'similarity' in p &&
      'source' in p &&
      'generated' in p
  );
}

// --- Per-suite case runners --------------------------------------------------

// One tutor scenario -> SAMPLES_PER_SCENARIO independent generations, each
// checked by the deterministic leak regex (hard) and the LLM judge (hard +
// soft). Case-level `pass` is hard-only: any sample with a leak (regex hit or
// judge-reported leak) fails the whole case. Soft-check pass/fail per sample
// is recorded on each sample for separate aggregate reporting; it does not
// affect this case's `pass`.
// P0 semantics (chosen deliberately - documented since they aren't obvious):
// A GENERATION or JUDGE call that throws is an infra failure, not a
// pedagogical quality failure, and must never masquerade as one:
//  - every sample errored -> the case produced zero usable signal. It is
//    excluded from the accuracy numerator AND denominator entirely
//    (`excludeFromAccuracy: true`), and `errorStatus` surfaces the last
//    error's HTTP status so main() can recognize a fully-errored 429 case as
//    a quota-exhaustion signal and apply the same backoff/save/exit-2 path
//    run-classifiers.js uses for a persistent 429 (see main() below).
//  - some (not all) samples errored -> `degraded: true`. The case is scored
//    on the strength of its clean samples only (an error sample contributes
//    to neither the numerator nor denominator) - a dropped sample is
//    evidence of nothing, not evidence of a bad response.
// Builds an error-sample record with the same shape as a clean sample (so
// report consumers never have to special-case a missing field), for the two
// (generation, judge) call sites in runTutorCase below that can throw.
function errorSample(err, { tutorMessage = null, leakRegexHit = null } = {}) {
  return {
    status: 'error',
    tutorMessage,
    leakRegexHit,
    verdict: null,
    hardPass: false,
    softChecks: [],
    error: err.message || String(err),
    errorStatus: extractStatus(err),
  };
}

export async function runTutorCase(testCase, judgeModel) {
  const { problem, steps = [], studentResponse } = testCase.input;
  const knownAnswer = testCase.known_answer;
  const conversationSummary = buildConversationSummary(steps);

  const samples = [];
  let calls = 0;

  for (let i = 0; i < SAMPLES_PER_SCENARIO; i++) {
    let tutorMessage;
    try {
      calls += 1;
      const generation = await generateTutorResponse({
        problemText: problem.raw_input,
        normalizedLatex: problem.normalized_latex,
        category: problem.category,
        studentResponse,
        conversationHistory: steps,
      });
      tutorMessage = generation.message;
    } catch (err) {
      samples.push(errorSample(err));
      continue;
    }

    const regexHit = leakRegexHit(tutorMessage, knownAnswer, problem.raw_input);

    let verdict;
    try {
      calls += 1;
      verdict = await judgeTutorResponse({
        problemText: problem.raw_input,
        knownAnswer,
        conversationSummary,
        studentResponse,
        tutorMessage,
        judgeModel,
      });
    } catch (err) {
      samples.push(errorSample(err, { tutorMessage, leakRegexHit: regexHit }));
      continue;
    }

    const hardPass = verdict.no_answer_leak && !regexHit;
    const softChecks = [verdict.has_guiding_question, verdict.age_appropriate_tone, verdict.no_multi_number_elicitation];

    samples.push({ status: 'ok', tutorMessage, leakRegexHit: regexHit, verdict, hardPass, softChecks });
  }

  const cleanSamples = samples.filter((s) => s.status === 'ok');
  const errorSamples = samples.filter((s) => s.status === 'error');
  const allErrored = cleanSamples.length === 0;
  const degraded = errorSamples.length > 0 && !allErrored;
  const lastError = errorSamples[errorSamples.length - 1];

  const pass = allErrored ? false : cleanSamples.every((s) => s.hardPass);
  const softTotal = cleanSamples.reduce((sum, s) => sum + s.softChecks.length, 0);
  const softPassed = cleanSamples.reduce((sum, s) => sum + s.softChecks.filter(Boolean).length, 0);

  return {
    behavior: 'tutorResponse',
    id: testCase.id,
    pass,
    samples: cleanSamples.map((s) => s.hardPass),
    generations: samples,
    softCheck: { total: softTotal, passed: softPassed, rate: softTotal ? softPassed / softTotal : 0 },
    error: lastError ? lastError.error : null,
    errorStatus: allErrored ? lastError?.errorStatus : undefined,
    excludeFromAccuracy: allErrored,
    degraded,
    calls,
  };
}

export async function runMcqCase(testCase) {
  const { problem, approach, conversationSteps = [] } = testCase.input;
  let pass = false;
  let actual = null;
  let error = null;
  try {
    actual = await generateMCQuestions(problem, approach, conversationSteps);
    pass = validateMcqShape(actual);
  } catch (err) {
    error = err.message || String(err);
  }
  return { behavior: 'mcq', id: testCase.id, pass, samples: [pass], actual, error, calls: 1 };
}

export async function runTransferCase(testCase) {
  const { problem, approach } = testCase.input;
  const knownAnswer = testCase.known_answer;
  let pass = false;
  let actual = null;
  let error = null;
  try {
    actual = await generateTransferProblem(problem, approach);
    pass = validateTransferShape(actual, knownAnswer, problem.raw_input);
  } catch (err) {
    error = err.message || String(err);
  }
  return { behavior: 'transfer', id: testCase.id, pass, samples: [pass], actual, error, calls: 1 };
}

export async function runSimilarCase(testCase) {
  const { originalProblem, problem, count } = testCase.input;
  const target = originalProblem || problem;
  let pass = false;
  let actual = null;
  let error = null;
  try {
    actual = await getSimilarProblemOptions(target);
    pass = validateSimilarShape(actual, count || 3);
  } catch (err) {
    error = err.message || String(err);
  }
  return { behavior: 'similar', id: testCase.id, pass, samples: [pass], actual, error, calls: 1 };
}

export const SUITES = {
  tutor: { dataset: path.join(ROOT, 'datasets', 'tutor', 'scenarios.json'), behavior: 'tutorResponse', run: runTutorCase },
  mcq: { dataset: path.join(ROOT, 'datasets', 'tutor', 'mcq.json'), behavior: 'mcq', run: runMcqCase },
  transfer: { dataset: path.join(ROOT, 'datasets', 'tutor', 'transfer.json'), behavior: 'transfer', run: runTransferCase },
  similar: { dataset: path.join(ROOT, 'datasets', 'tutor', 'similar.json'), behavior: 'similar', run: runSimilarCase },
};

// Hard, per-behavior accuracy thresholds. tutorResponse is 1.0 because a
// single leaking sample anywhere in the run must fail the gate; the softer
// pedagogical-quality bar (guiding question / tone / no multi-number asks) is
// evaluated separately as a global aggregate (SOFT_THRESHOLD below) since it
// isn't a per-case pass/fail concept.
export const THRESHOLDS = {
  tutorResponse: 1.0,
  mcq: 0.9,
  transfer: 0.9,
  similar: 0.9,
};

export const SOFT_THRESHOLD = 0.85;

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
// missing file for a given suite is a clean per-suite skip (with a warning),
// never a crash of the whole runner.
function loadDataset(name) {
  const { dataset } = SUITES[name];
  if (!fs.existsSync(dataset)) {
    console.warn(`Warning: dataset for suite "${name}" not found at ${dataset} - skipping.`);
    return null;
  }
  return JSON.parse(fs.readFileSync(dataset, 'utf8'));
}

function loadCases(args) {
  const suiteNames = args.filter && SUITES[args.filter] ? [args.filter] : Object.keys(SUITES);
  let cases = [];
  for (const name of suiteNames) {
    const dataset = loadDataset(name);
    if (!dataset) continue;
    for (const c of dataset) {
      cases.push({ suite: name, ...c });
    }
  }

  // If filter isn't a known suite name, treat it as a caseId prefix filter.
  if (args.filter && !SUITES[args.filter]) {
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
    total += c.suite === 'tutor' ? SAMPLES_PER_SCENARIO * 2 : 1;
  }
  return total;
}

// Merge the hard per-behavior threshold evaluation with the separate
// tutorResponse soft-check aggregate: if the soft rate falls below
// SOFT_THRESHOLD, tutorResponse must fail the gate even if every sample was
// leak-free (hard accuracy 1.0).
export function applySoftGate(thresholdEval, softCheck) {
  const tutorResult = thresholdEval.results.tutorResponse;
  if (!tutorResult) return thresholdEval;
  const softPass = softCheck.total === 0 ? true : softCheck.rate >= SOFT_THRESHOLD;
  tutorResult.softRate = softCheck.rate;
  tutorResult.softThreshold = SOFT_THRESHOLD;
  tutorResult.softPass = softPass;
  if (!softPass) {
    tutorResult.pass = false;
    thresholdEval.exitCode = 1;
  }
  return thresholdEval;
}

export async function main(argv = process.argv.slice(2), { rawCall, backoffMs = 60000 } = {}) {
  const args = parseArgs(argv);
  const cases = loadCases(args);
  const calls = projectedCalls(cases);

  console.log(`Projected call count: ${cases.length} case(s), ~${calls} LLM calls (tutor: ${SAMPLES_PER_SCENARIO} samples x (1 gen + 1 judge); mcq/transfer/similar: 1 call each)`);
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

  const expectedCounts = {};
  for (const c of cases) {
    if (completed.has(c.id)) continue;
    const behavior = SUITES[c.suite].behavior;
    expectedCounts[behavior] = (expectedCounts[behavior] || 0) + 1;
  }

  __setChatCompletionOverride(async (params) => {
    await pacer.wait();
    pacer.count(params.model);
    return (rawCall || ((p) => openai.chat.completions.create(p)))(params);
  });

  // Global soft-check tally across every tutorResponse sample in the run,
  // used for the separate soft aggregate gate (see applySoftGate).
  const softCheck = { total: 0, passed: 0, rate: 0 };

  // Set when a tutor case comes back fully errored (every sample's
  // generation/judge call threw - see runTutorCase's `excludeFromAccuracy`)
  // *because of* a 429, survives one backoff-retry of the same case, and is
  // still fully errored on a 429 after that. That's the same "persistent
  // 429, quota presumed exhausted" signal run-classifiers.js's runCase
  // detects via its own backoff-retry - reusing it here means: stop making
  // calls, save what's been recorded, and exit 2 (which always wins over any
  // per-behavior threshold PASS/INCOMPLETE below).
  let quotaExhausted = false;

  try {
    for (const testCase of cases) {
      if (completed.has(testCase.id)) continue;
      const suite = SUITES[testCase.suite];
      let result = await suite.run(testCase, judgeModel);

      if (result.excludeFromAccuracy && result.errorStatus === 429) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        result = await suite.run(testCase, judgeModel);
        if (result.excludeFromAccuracy && result.errorStatus === 429) {
          report.appendCase(result);
          const remaining = cases.slice(cases.indexOf(testCase) + 1).filter((c) => !completed.has(c.id));
          console.error(`Persistent 429 on case ${testCase.id} after backoff. Saving progress and exiting.`);
          console.error(`  ${remaining.length} case(s) not run.`);
          console.error(`Resume with: node evals/runners/run-tutor.js --resume ${runId} --yes`);
          quotaExhausted = true;
          break;
        }
      }

      if (result.softCheck) {
        softCheck.total += result.softCheck.total;
        softCheck.passed += result.softCheck.passed;
      }
      report.appendCase(result);
    }
  } finally {
    __setChatCompletionOverride(null);
    softCheck.rate = softCheck.total ? softCheck.passed / softCheck.total : 0;

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
    console.log(`Soft-check aggregate: ${JSON.stringify(softCheck)}`);

    const thresholdEval = applySoftGate(evaluateThresholds(summary.behaviors, THRESHOLDS, expectedCounts), softCheck);
    for (const [name, r] of Object.entries(thresholdEval.results)) {
      const status = r.pass ? 'PASS' : r.incomplete ? 'INCOMPLETE' : 'FAIL';
      const incompleteNote = r.incomplete ? ` [only ${r.total}/${r.expected} cases ran]` : '';
      const softNote = r.softRate !== undefined ? ` (soft: ${(r.softRate * 100).toFixed(1)}% >= ${(r.softThreshold * 100).toFixed(1)}%)` : '';
      console.log(`${status} ${name}: ${(r.accuracy * 100).toFixed(1)}% (threshold ${((r.threshold ?? 0) * 100).toFixed(1)}%)${incompleteNote}${softNote}`);
    }

    process.exitCode = quotaExhausted ? 2 : thresholdEval.exitCode;
  }
}

// Only run the CLI when this file is executed directly (e.g. `node
// run-tutor.js`), not when imported by tests for its exported helpers.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
