import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { __setChatCompletionOverride } from '../src/services/openai.js';
import { getSimilarProblemOptions } from '../src/services/problemSimilarityService.js';

afterEach(() => {
  __setChatCompletionOverride(null);
});

const originalProblem = { raw_input: 'Solve for x: 2x + 3 = 7' };

test('returns up to 3 generated options when the LLM returns a numbered list', async () => {
  __setChatCompletionOverride(async () => ({
    choices: [{
      message: {
        content: '1. Solve for x: 3x + 1 = 10\n2. Solve for x: 4x - 2 = 14\n3. Solve for x: 5x + 5 = 20'
      }
    }]
  }));

  const result = await getSimilarProblemOptions(originalProblem);

  assert.ok(Array.isArray(result));
  assert.ok(result.length <= 3);
  assert.ok(result.length > 0);
  for (const option of result) {
    assert.equal(option.source, 'generated');
    assert.equal(option.generated, true);
    assert.equal(option.similarity, null);
    assert.equal(typeof option.problemText, 'string');
    assert.ok(option.problemText.length > 0);
  }
});

test('resolves within timeout with empty results when the LLM never resolves', { timeout: 8000 }, async () => {
  __setChatCompletionOverride(() => new Promise(() => {}));

  const result = await getSimilarProblemOptions(originalProblem);

  assert.deepEqual(result, []);
});

test('returns empty array when the LLM throws', async () => {
  __setChatCompletionOverride(async () => {
    throw new Error('LLM exploded');
  });

  const result = await getSimilarProblemOptions(originalProblem);

  assert.deepEqual(result, []);
});
