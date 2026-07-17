import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCase, subsetCompare, evaluateThresholds, THRESHOLDS, main } from '../evals/runners/run-classifiers.js';

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

function make429() {
  const err = new Error('rate limited');
  err.status = 429;
  return err;
}

test('runCase: 429 then success on the backoff-retry passes with 2 calls, no throw', async () => {
  let invokeCount = 0;
  const behaviorDef = {
    invoke: async () => {
      invokeCount += 1;
      if (invokeCount === 1) throw make429();
      return { hasMath: true };
    },
    compare,
  };

  const result = await runCase(behaviorDef, testCase, undefined, { backoffMs: 0 });

  assert.equal(invokeCount, 2, 'backoff-retry success must still make the retry call');
  assert.equal(result.calls, 2);
  assert.equal(result.pass, true);
  assert.equal(result.error, null);
});

test('runCase: a second consecutive 429 after the backoff-retry propagates (throws), it is not swallowed', async () => {
  let invokeCount = 0;
  const behaviorDef = {
    invoke: async () => {
      invokeCount += 1;
      throw make429();
    },
    compare,
  };

  await assert.rejects(
    () => runCase(behaviorDef, testCase, undefined, { backoffMs: 0 }),
    (error) => error.status === 429
  );
  assert.equal(invokeCount, 2, 'must attempt exactly once plus one backoff-retry before giving up');
});

// --- Registry mapping (stub seam over the shared openai module) -----------
// These behaviors call service functions that go through
// createChatCompletion in src/services/openai.js. __setChatCompletionOverride
// replaces that seam with a canned completion, so we exercise the real
// registry invoke() mapping without any live LLM call.

function makeChoicesResponse(content) {
  return { choices: [{ message: { content } }] };
}

function stubCompletion(content) {
  return async () => makeChoicesResponse(content);
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

// --- silent truncation regression ------------------------------------------
// A behavior that only completed 2 of its 20 intended cases (e.g. a run that
// aborted mid-behavior on a persistent 429) must never read as a clean PASS
// just because the 2 it did complete happened to be correct.

test('evaluateThresholds: a behavior short of its expected case count fails even at 100% accuracy on what ran', () => {
  const behaviors = { gradeTransferAnswer: { total: 2, passed: 2, accuracy: 1 } };
  const expectedCounts = { gradeTransferAnswer: 20 };
  const { results, exitCode } = evaluateThresholds(behaviors, THRESHOLDS, expectedCounts);
  assert.equal(results.gradeTransferAnswer.pass, false);
  assert.equal(results.gradeTransferAnswer.incomplete, true);
  assert.equal(exitCode, 1);
});

test('evaluateThresholds: a behavior that never started at all (absent from behaviors) is surfaced as a failure, not invisible', () => {
  const behaviors = { hasMathProblem: { total: 40, passed: 40, accuracy: 1 } };
  const expectedCounts = { hasMathProblem: 40, gradeTransferAnswer: 20 };
  const { results, exitCode } = evaluateThresholds(behaviors, THRESHOLDS, expectedCounts);
  assert.equal(results.hasMathProblem.pass, true);
  assert.equal(results.gradeTransferAnswer.pass, false);
  assert.equal(results.gradeTransferAnswer.incomplete, true);
  assert.equal(results.gradeTransferAnswer.total, 0);
  assert.equal(exitCode, 1);
});

test('evaluateThresholds: a behavior that ran every expected case is unaffected by expectedCounts', () => {
  const behaviors = { hasMathProblem: { total: 40, passed: 40, accuracy: 1 } };
  const expectedCounts = { hasMathProblem: 40 };
  const { results } = evaluateThresholds(behaviors, THRESHOLDS, expectedCounts);
  assert.equal(results.hasMathProblem.pass, true);
  assert.equal(results.hasMathProblem.incomplete, false);
});

// --- main(): persistent-429 mid-behavior must never silently truncate -----
// Regression test for the live bug: a 429 that survives the backoff-retry
// during gradeTransferAnswer recorded only 2/20 cases yet the run looked
// clean. Drives the real main() loop (via the rawCall/backoffMs test seam)
// against the real gradeTransferAnswer.json dataset (20 cases) so this
// exercises the actual registry invoke() -> createChatCompletion path, not
// a mock of runCase.

test('main(): a persistent 429 mid-behavior exits 2, stops the run, and never reports a false PASS', async () => {
  let callCount = 0;
  // gta-001 and gta-002 succeed (1 raw call each). gta-003 then hits a real,
  // unrecovered quota exhaustion: createChatCompletion's own primary+fallback
  // pair (calls 3-4) both 429, and the same is true of runCase's
  // backoff-retry primary+fallback pair (calls 5-6) - 4 consecutive 429s,
  // matching what "persistent 429 survives the createChatCompletion
  // fallback, twice" actually looks like end to end.
  const rawCall = async () => {
    callCount += 1;
    if (callCount >= 3 && callCount <= 6) throw make429();
    return makeChoicesResponse('{"is_correct": true}');
  };

  const originalExit = process.exit;
  let capturedExitCode;
  process.exit = (code) => {
    capturedExitCode = code;
    throw new Error('__TEST_EXIT__');
  };

  try {
    await assert.rejects(
      main(['--filter', 'gradeTransferAnswer', '--rpm', '1000000', '--yes'], { rawCall, backoffMs: 0 }),
      /__TEST_EXIT__/
    );
  } finally {
    process.exit = originalExit;
  }

  assert.equal(capturedExitCode, 2, 'persistent 429 must exit 2 - never silently 0');
  // Only gta-001/gta-002 ran; the other 18 cases in this behavior, and any
  // case invocation past the failure, must not have happened.
  assert.equal(callCount, 6, 'must stop calling the model once the backoff-retry itself 429s again');
});
