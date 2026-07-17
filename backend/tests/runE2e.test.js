import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runE2eCase, computeAssertions, THRESHOLDS, main } from '../evals/runners/run-e2e.js';
import { __setChatCompletionOverride } from '../src/services/openai.js';

afterEach(() => {
  __setChatCompletionOverride(null);
  process.exitCode = 0;
});

const DATASET_PATH = fileURLToPath(new URL('../evals/datasets/e2e/scenarios.json', import.meta.url));
const scenarios = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));

function findByPersona(persona) {
  const found = scenarios.find((c) => c.persona === persona);
  assert.ok(found, `expected a dataset scenario with persona "${persona}"`);
  return found;
}

function makeChoicesResponse(content) {
  return { choices: [{ message: { content } }] };
}

function queuedStub(contents) {
  let i = 0;
  return async () => {
    const content = contents[i];
    i += 1;
    return makeChoicesResponse(content);
  };
}

const NEUTRAL_TUTOR_TEXT = 'PLACEHOLDER_QUESTION?';
const NO_FORMULA_TEXT = 'PLACEHOLDER_NO_FORMULA';
const completionJson = (completed, correct) =>
  JSON.stringify({ solution_completed: completed, is_correct: correct, reasoning: 'r' });
const judgeJson = JSON.stringify({
  no_answer_leak: true,
  has_guiding_question: true,
  age_appropriate_tone: true,
  no_multi_number_elicitation: true,
  reasoning: 'r',
});

// --- computeAssertions (pure helper) ---------------------------------------

test('computeAssertions: only evaluates keys present in expectations', () => {
  const assertions = computeAssertions({}, { completedAtTurn: null, completedCorrect: null, hintFiredAtTurn: null });
  assert.deepEqual(assertions, {});
});

test('computeAssertions: completionBy passes when completed at or before the expected turn', () => {
  const assertions = computeAssertions(
    { completionBy: 4 },
    { completedAtTurn: 3, completedCorrect: null, hintFiredAtTurn: null }
  );
  assert.equal(assertions.completionBy, true);
});

test('computeAssertions: completionBy fails when never completed', () => {
  const assertions = computeAssertions(
    { completionBy: 4 },
    { completedAtTurn: null, completedCorrect: null, hintFiredAtTurn: null }
  );
  assert.equal(assertions.completionBy, false);
});

test('computeAssertions: completedCorrect fails on a correctness mismatch', () => {
  const assertions = computeAssertions(
    { completedCorrect: true },
    { completedAtTurn: 2, completedCorrect: false, hintFiredAtTurn: null }
  );
  assert.equal(assertions.completedCorrect, false);
});

test('computeAssertions: hintBy fails when the hint never fires', () => {
  const assertions = computeAssertions(
    { hintBy: 3 },
    { completedAtTurn: null, completedCorrect: null, hintFiredAtTurn: null }
  );
  assert.equal(assertions.hintBy, false);
});

test('computeAssertions: hintBy passes when the hint fires at or before the expected turn', () => {
  const assertions = computeAssertions(
    { hintBy: 3 },
    { completedAtTurn: null, completedCorrect: null, hintFiredAtTurn: 3 }
  );
  assert.equal(assertions.hintBy, true);
});

// --- runE2eCase: fast-correct scenario drives to early completion -----------

test('runE2eCase: fast-correct scenario completes early, case passes, call count stays below the full-turn budget', async () => {
  const testCase = findByPersona('fast-correct');
  const turnCap = Math.min(testCase.script.length, testCase.maxTurns);
  const fullBudgetCalls = turnCap * 2 + 1; // 2 "calls" increments/turn + 1 judge call, if it ran every turn

  __setChatCompletionOverride(
    queuedStub([NO_FORMULA_TEXT, NEUTRAL_TUTOR_TEXT, completionJson(true, true), judgeJson])
  );

  const result = await runE2eCase(testCase, 'judge-model/x');

  assert.equal(result.pass, true);
  assert.equal(result.completedAtTurn, 1);
  assert.equal(result.assertions.completedCorrect, true);
  assert.equal(result.excludeFromAccuracy, false);
  assert.ok(result.calls < fullBudgetCalls, 'early completion must stop turns short of the full-turn budget');
});

// --- runE2eCase: always-stuck scenario fires the hint observable ------------

test('runE2eCase: always-stuck scenario fires the hint by the expected turn', async () => {
  const dataset = findByPersona('always-stuck');
  const testCase = { ...dataset, maxTurns: 3 };
  const expectedHintTurn = dataset.expectations.hintBy;

  __setChatCompletionOverride(
    queuedStub([
      NEUTRAL_TUTOR_TEXT,
      completionJson(false, false),
      NEUTRAL_TUTOR_TEXT,
      completionJson(false, false),
      NEUTRAL_TUTOR_TEXT,
      completionJson(false, false),
      judgeJson,
    ])
  );

  const result = await runE2eCase(testCase, 'judge-model/x');

  assert.equal(result.hintFiredAtTurn, expectedHintTurn);
  assert.equal(result.assertions.hintBy, true);
  assert.equal(result.completedAtTurn, null);
  assert.equal(result.pass, true);
});

// --- runE2eCase: error path is an infra failure, not a quality fail ---------

test('runE2eCase: a thrown error on the first call excludes the case from accuracy rather than failing it on quality', async () => {
  const testCase = findByPersona('fast-correct');

  __setChatCompletionOverride(async () => {
    throw new Error('simulated infra failure');
  });

  const result = await runE2eCase(testCase, 'judge-model/x');

  assert.equal(result.excludeFromAccuracy, true);
  assert.ok(result.error, 'error message recorded for visibility');
  assert.equal(result.completedAtTurn, null);
  assert.equal(result.pass, false);
});

// --- main(): --dry-run makes zero calls -------------------------------------

test('main: --dry-run makes zero LLM calls', async () => {
  let callCount = 0;
  const rawCall = async () => {
    callCount += 1;
    return makeChoicesResponse('{}');
  };

  await main(['--dry-run'], { rawCall });

  assert.equal(callCount, 0, 'dry-run must not invoke the chat completion at all');
});

// --- THRESHOLDS sanity -------------------------------------------------------

test('THRESHOLDS: exposes the e2eSim behavior threshold', () => {
  assert.ok('e2eSim' in THRESHOLDS);
});
