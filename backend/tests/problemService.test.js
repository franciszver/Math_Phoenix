import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { validateProblem } from '../src/services/problemService.js';
import { __setChatCompletionOverride } from '../src/services/openai.js';

afterEach(() => {
  __setChatCompletionOverride(null);
});

test('"1+2" is valid via fast-path, LLM not called', async () => {
  let called = false;
  __setChatCompletionOverride(async () => {
    called = true;
    return { choices: [{ message: { content: 'INVALID: not a question' } }] };
  });

  const result = await validateProblem('1+2');

  assert.equal(result.valid, true);
  assert.equal(called, false);
});

test('"3x - 4 = 11" is valid via fast-path, LLM not called', async () => {
  let called = false;
  __setChatCompletionOverride(async () => {
    called = true;
    return { choices: [{ message: { content: 'INVALID: not a question' } }] };
  });

  const result = await validateProblem('3x - 4 = 11');

  assert.equal(result.valid, true);
  assert.equal(called, false);
});

test('"2(x+1)=10" is valid via fast-path, LLM not called', async () => {
  let called = false;
  __setChatCompletionOverride(async () => {
    called = true;
    return { choices: [{ message: { content: 'INVALID: not a question' } }] };
  });

  const result = await validateProblem('2(x+1)=10');

  assert.equal(result.valid, true);
  assert.equal(called, false);
});

test('"hello world" falls through to the LLM, which rules it invalid', async () => {
  let called = false;
  __setChatCompletionOverride(async () => {
    called = true;
    return { choices: [{ message: { content: 'INVALID: not a math problem' } }] };
  });

  const result = await validateProblem('hello world');

  assert.equal(called, true);
  assert.equal(result.valid, false);
});

test('empty/whitespace text is invalid without calling the LLM', async () => {
  let called = false;
  __setChatCompletionOverride(async () => {
    called = true;
    return { choices: [{ message: { content: 'VALID' } }] };
  });

  const emptyResult = await validateProblem('');
  const whitespaceResult = await validateProblem('   ');

  assert.equal(emptyResult.valid, false);
  assert.equal(whitespaceResult.valid, false);
  assert.equal(called, false);
});

test('"Solve 2x+5=13" falls through to the LLM (contains a word), which rules it valid', async () => {
  let called = false;
  __setChatCompletionOverride(async () => {
    called = true;
    return { choices: [{ message: { content: 'VALID' } }] };
  });

  const result = await validateProblem('Solve 2x+5=13');

  assert.equal(called, true);
  assert.equal(result.valid, true);
});
