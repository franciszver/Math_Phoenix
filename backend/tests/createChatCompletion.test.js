import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChatCompletion,
  __setChatCompletionOverride,
  TEXT_MODEL,
  VISION_MODEL,
  TEXT_MODEL_FALLBACK,
  VISION_MODEL_FALLBACK
} from '../src/services/openai.js';

test('happy path returns the response, called once with given model', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    return { model: params.model, choices: [{ message: { content: 'ok' } }] };
  });

  const result = await createChatCompletion({ model: TEXT_MODEL, messages: [] });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, TEXT_MODEL);
  assert.equal(result.model, TEXT_MODEL);

  __setChatCompletionOverride(null);
});

test('429 error is retried once with TEXT_MODEL_FALLBACK', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    if (calls.length === 1) {
      const err = new Error('rate limited');
      err.status = 429;
      throw err;
    }
    return { model: params.model, choices: [{ message: { content: 'fallback ok' } }] };
  });

  const result = await createChatCompletion({ model: TEXT_MODEL, messages: [] });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].model, TEXT_MODEL);
  assert.equal(calls[1].model, TEXT_MODEL_FALLBACK);
  assert.equal(result.model, TEXT_MODEL_FALLBACK);

  __setChatCompletionOverride(null);
});

test('503 error is retried once with fallback model', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    if (calls.length === 1) {
      const err = new Error('server error');
      err.status = 503;
      throw err;
    }
    return { model: params.model, choices: [{ message: { content: 'fallback ok' } }] };
  });

  const result = await createChatCompletion({ model: TEXT_MODEL, messages: [] });

  assert.equal(calls.length, 2);
  assert.equal(calls[1].model, TEXT_MODEL_FALLBACK);
  assert.equal(result.model, TEXT_MODEL_FALLBACK);

  __setChatCompletionOverride(null);
});

test('vision model 429 is retried with vision fallback model', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    if (calls.length === 1) {
      const err = new Error('rate limited');
      err.status = 429;
      throw err;
    }
    return { model: params.model, choices: [{ message: { content: 'fallback ok' } }] };
  });

  const result = await createChatCompletion({ model: VISION_MODEL, messages: [] });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].model, VISION_MODEL);
  assert.equal(calls[1].model, VISION_MODEL_FALLBACK);
  assert.equal(result.model, VISION_MODEL_FALLBACK);

  __setChatCompletionOverride(null);
});

test('non-retryable error (401) is rethrown without retry', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    const err = new Error('unauthorized');
    err.status = 401;
    throw err;
  });

  await assert.rejects(
    () => createChatCompletion({ model: TEXT_MODEL, messages: [] }),
    /unauthorized/
  );
  assert.equal(calls.length, 1);

  __setChatCompletionOverride(null);
});

test('failure of the fallback attempt also propagates', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    const err = new Error(calls.length === 1 ? 'rate limited' : 'fallback also failed');
    err.status = calls.length === 1 ? 429 : 500;
    throw err;
  });

  await assert.rejects(
    () => createChatCompletion({ model: TEXT_MODEL, messages: [] }),
    /fallback also failed/
  );
  assert.equal(calls.length, 2);

  __setChatCompletionOverride(null);
});
