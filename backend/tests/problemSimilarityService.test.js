import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// TIMEOUT_MS is read from SIMILARITY_TIMEOUT_MS at module load time, so set it
// small before importing problemSimilarityService.js (this file runs in its
// own process under node --test, so this doesn't affect other test files).
process.env.SIMILARITY_TIMEOUT_MS = '200';

const { __setChatCompletionOverride } = await import('../src/services/openai.js');
const { getSimilarProblemOptions } = await import('../src/services/problemSimilarityService.js');

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

test('resolves within timeout with empty results when the LLM never resolves', async () => {
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
