import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCase, subsetCompare, evaluateThresholds, THRESHOLDS } from '../evals/runners/run-classifiers.js';

const testCase = { behavior: 'hasMathProblem', id: 'c1', input: {}, expected: { hasMath: true } };
const compare = (expected, actual) => expected.hasMath === actual.hasMath;

test('runCase: a wrong (non-erroring) answer is NOT retried - one call, pass=false', async () => {
  let invokeCount = 0;
  const behaviorDef = {
    invoke: async () => {
      invokeCount += 1;
      return { hasMath: false }; // always wrong vs. expected: { hasMath: true }
    },
    compare,
  };

  const result = await runCase(behaviorDef, testCase);

  assert.equal(invokeCount, 1, 'a mismatch must not trigger a retry');
  assert.equal(result.calls, 1);
  assert.equal(result.pass, false);
  assert.deepEqual(result.samples, [false]);
});

test('runCase: correct first attempt passes with a single call', async () => {
  let invokeCount = 0;
  const behaviorDef = {
    invoke: async () => {
      invokeCount += 1;
      return { hasMath: true };
    },
    compare,
  };

  const result = await runCase(behaviorDef, testCase);

  assert.equal(invokeCount, 1);
  assert.equal(result.calls, 1);
  assert.equal(result.pass, true);
  assert.deepEqual(result.samples, [true]);
});

test('runCase: a non-429 error fails the case immediately (no retry)', async () => {
  let invokeCount = 0;
  const behaviorDef = {
    invoke: async () => {
      invokeCount += 1;
      throw new Error('boom');
    },
    compare,
  };

  const result = await runCase(behaviorDef, testCase);

  assert.equal(invokeCount, 1);
  assert.equal(result.pass, false);
  assert.equal(result.error, 'boom');
});

// Note: the persistent-429 path (backoff-retry-once, then propagate) is not
// covered here because runCase's backoff uses a hardcoded 60s setTimeout -
// exercising it would make the suite 60s+ slower. Verified by static trace
// instead: see review notes.

// --- Registry mapping (stub seam over the shared openai module) -----------
// These behaviors call service functions that go through
// createChatCompletion in src/services/openai.js. __setChatCompletionOverride
// replaces that seam with a canned completion, so we exercise the real
// registry invoke() mapping without any live LLM call.

function stubCompletion(content) {
  return async () => ({ choices: [{ message: { content } }] });
}

test('registry: validateProblem maps LLM VALID response to {valid: true}', async () => {
  const { BEHAVIORS } = await import('../evals/runners/run-classifiers.js');
  const { __setChatCompletionOverride } = await import('../src/services/openai.js');
  __setChatCompletionOverride(stubCompletion('VALID'));
  try {
    const actual = await BEHAVIORS.validateProblem.invoke({ text: 'What is the value of x if 2x = 10?' });
    assert.deepEqual(actual, { valid: true });
  } finally {
    __setChatCompletionOverride(null);
  }
});

test('registry: detectMultipleProblems maps a MULTIPLE completion to {multiple: true, problemCount: 2}', async () => {
  const { BEHAVIORS } = await import('../evals/runners/run-classifiers.js');
  const { __setChatCompletionOverride } = await import('../src/services/openai.js');
  __setChatCompletionOverride(stubCompletion('MULTIPLE:\n1. What is 2+2?\n2. What is 3+3?'));
  try {
    const actual = await BEHAVIORS.detectMultipleProblems.invoke({ text: 'What is 2+2? What is 3+3?' });
    assert.deepEqual(actual, { multiple: true, problemCount: 2 });
  } finally {
    __setChatCompletionOverride(null);
  }
});

test('registry: detectMultipleProblems maps a SINGLE completion to {multiple: false, problemCount: 1}', async () => {
  const { BEHAVIORS } = await import('../evals/runners/run-classifiers.js');
  const { __setChatCompletionOverride } = await import('../src/services/openai.js');
  __setChatCompletionOverride(stubCompletion('SINGLE: What is 2+2?'));
  try {
    const actual = await BEHAVIORS.detectMultipleProblems.invoke({ text: 'What is 2+2?' });
    assert.deepEqual(actual, { multiple: false, problemCount: 1 });
  } finally {
    __setChatCompletionOverride(null);
  }
});

test('registry: gradeTransferAnswer maps a JSON completion to {is_correct: true}', async () => {
  const { BEHAVIORS } = await import('../evals/runners/run-classifiers.js');
  const { __setChatCompletionOverride } = await import('../src/services/openai.js');
  __setChatCompletionOverride(stubCompletion('{"is_correct": true, "reasoning": "matches"}'));
  try {
    const actual = await BEHAVIORS.gradeTransferAnswer.invoke({
      transferProblem: { problem_text: '3x = 9' },
      studentAnswer: '3',
    });
    assert.deepEqual(actual, { is_correct: true });
  } finally {
    __setChatCompletionOverride(null);
  }
});

// --- subset-compare semantics ----------------------------------------------

test('subsetCompare: passes when every expected key deep-equals actual, ignoring extra actual fields', () => {
  const expected = { valid: true };
  const actual = { valid: true, reason: null };
  assert.equal(subsetCompare(expected, actual), true);
});

test('subsetCompare: fails when any expected key mismatches', () => {
  const expected = { multiple: true, problemCount: 2 };
  const actual = { multiple: true, problemCount: 1 };
  assert.equal(subsetCompare(expected, actual), false);
});

test('subsetCompare: fails on missing/undefined actual', () => {
  assert.equal(subsetCompare({ valid: true }, undefined), false);
});

// --- threshold evaluation / exit-code logic ---------------------------------

test('evaluateThresholds: all behaviors at/above threshold yields exitCode 0 and all PASS', () => {
  const behaviors = {
    hasMathProblem: { accuracy: 0.95 },
    validateProblem: { accuracy: 0.85 },
  };
  const { results, exitCode } = evaluateThresholds(behaviors);
  assert.equal(exitCode, 0);
  assert.equal(results.hasMathProblem.pass, true);
  assert.equal(results.validateProblem.pass, true);
});

test('evaluateThresholds: one behavior below threshold yields exitCode 1 and marks it FAIL', () => {
  const behaviors = {
    hasMathProblem: { accuracy: 0.95 },
    gradeTransferAnswer: { accuracy: 0.5 },
  };
  const { results, exitCode } = evaluateThresholds(behaviors);
  assert.equal(exitCode, 1);
  assert.equal(results.hasMathProblem.pass, true);
  assert.equal(results.gradeTransferAnswer.pass, false);
});

test('evaluateThresholds: uses THRESHOLDS as the default map', () => {
  const behaviors = { detectSolutionCompletion: { accuracy: THRESHOLDS.detectSolutionCompletion } };
  const { results } = evaluateThresholds(behaviors);
  assert.equal(results.detectSolutionCompletion.pass, true);
  assert.equal(results.detectSolutionCompletion.threshold, THRESHOLDS.detectSolutionCompletion);
});

test('evaluateThresholds: an unknown behavior (no threshold configured) always passes', () => {
  const behaviors = { someNewBehavior: { accuracy: 0.01 } };
  const { results, exitCode } = evaluateThresholds(behaviors);
  assert.equal(results.someNewBehavior.pass, true);
  assert.equal(exitCode, 0);
});
