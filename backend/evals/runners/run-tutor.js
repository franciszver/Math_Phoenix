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
  const pattern = new RegExp(`\\b${escaped}\\b`, 'i');

  if (!pattern.test(text)) return false;
  if (problemRawInput && pattern.test(problemRawInput)) return false;
  return true;
}

function buildConversationSummary(steps = []) {
  return steps.map((s) => `Tutor: ${s.tutor_prompt}\nStudent: ${s.student_response}`).join('\n\n');
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
export async function runTutorCase(testCase, judgeModel) {
  const { problem, steps = [], studentResponse } = testCase.input;
  const knownAnswer = testCase.known_answer;
  const conversationSummary = buildConversationSummary(steps);

  const samples = [];
  let calls = 0;
  let error = null;

  for (let i = 0; i < SAMPLES_PER_SCENARIO; i++) {
    try {
      calls += 1;
      const generation = await generateTutorResponse({
        problemText: problem.raw_input,
        normalizedLatex: problem.normalized_latex,
        category: problem.category,
        studentResponse,
        conversationHistory: steps,
      });
      const tutorMessage = generation.message;
      const regexHit = leakRegexHit(tutorMessage, knownAnswer, problem.raw_input);

      calls += 1;
      const verdict = await judgeTutorResponse({
        problemText: problem.raw_input,
        knownAnswer,
        conversationSummary,
        studentResponse,
        tutorMessage,
        judgeModel,
      });

      const hardPass = verdict.no_answer_leak && !regexHit;
      const softChecks = [verdict.has_guiding_question, verdict.age_appropriate_tone, verdict.no_multi_number_elicitation];

      samples.push({ tutorMessage, leakRegexHit: regexHit, verdict, hardPass, softChecks });
    } catch (err) {
      error = err.message || String(err);
      samples.push({ tutorMessage: null, leakRegexHit: null, verdict: null, hardPass: false, softChecks: [] });
    }
  }

  const pass = samples.length > 0 && samples.every((s) => s.hardPass);
  const softTotal = samples.reduce((sum, s) => sum + s.softChecks.length, 0);
  const softPassed = samples.reduce((sum, s) => sum + s.softChecks.filter(Boolean).length, 0);

  return {
    behavior: 'tutorResponse',
    id: testCase.id,
    pass,
    samples: samples.map((s) => s.hardPass),
    generations: samples,
    softCheck: { total: softTotal, passed: softPassed, rate: softTotal ? softPassed / softTotal : 0 },
    error,
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

export async function main(argv = process.argv.slice(2), { rawCall } = {}) {
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

  try {
    for (const testCase of cases) {
      if (completed.has(testCase.id)) continue;
      const suite = SUITES[testCase.suite];
      const result = await suite.run(testCase, judgeModel);
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

    process.exitCode = thresholdEval.exitCode;
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
