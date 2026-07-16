import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { extractTextFromImage } from '../src/services/imageService.js';
import { __setChatCompletionOverride } from '../src/services/openai.js';

afterEach(() => {
  __setChatCompletionOverride(null);
});

test('extractTextFromImage returns vision text on success', async () => {
  __setChatCompletionOverride(async () => ({
    choices: [{ message: { content: '2 + 2 = ?' } }]
  }));

  const result = await extractTextFromImage(Buffer.from('fake'));

  assert.equal(result.success, true);
  assert.equal(result.text, '2 + 2 = ?');
  assert.equal(result.source, 'vision');
  assert.equal(result.confidence, 0.9);
});

test('extractTextFromImage flags noMathProblem for NO_MATH_PROBLEM sentinel', async () => {
  __setChatCompletionOverride(async () => ({
    choices: [{ message: { content: 'NO_MATH_PROBLEM' } }]
  }));

  const result = await extractTextFromImage(Buffer.from('fake'));

  assert.equal(result.success, false);
  assert.equal(result.noMathProblem, true);
  assert.equal(result.source, 'vision');
});

test('extractTextFromImage returns a failure result (does not throw) when vision call throws', async () => {
  __setChatCompletionOverride(async () => {
    throw new Error('network exploded');
  });

  const result = await extractTextFromImage(Buffer.from('fake'));

  assert.equal(result.success, false);
  assert.equal(result.text, '');
  assert.equal(result.source, 'vision');
  assert.match(result.error, /Failed to extract text using Vision API/);
});
