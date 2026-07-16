import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCase } from '../evals/runners/run-classifiers.js';

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
