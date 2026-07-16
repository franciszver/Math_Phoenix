import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChatCompletion,
  __setChatCompletionOverride,
  TEXT_MODEL,
  VISION_MODEL,
  TEXT_MODEL_FALLBACK,
  VISION_MODEL_FALLBACK
} from '../src/services/openai.js';

afterEach(() => {
  __setChatCompletionOverride(null);
});

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
});

test('in-band error body triggers retry with fallback model', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    if (calls.length === 1) {
      return { error: { message: 'Provider returned error', code: 502 } };
    }
    return { model: params.model, choices: [{ message: { content: 'fallback ok' } }] };
  });

  const result = await createChatCompletion({ model: TEXT_MODEL, messages: [] });

  assert.equal(calls.length, 2);
  assert.equal(calls[1].model, TEXT_MODEL_FALLBACK);
  assert.equal(result.model, TEXT_MODEL_FALLBACK);
});

test('content null with finish_reason length triggers retry with fallback model', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    if (calls.length === 1) {
      return { model: params.model, choices: [{ message: { content: null }, finish_reason: 'length' }] };
    }
    return { model: params.model, choices: [{ message: { content: 'fallback ok' } }] };
  });

  const result = await createChatCompletion({ model: TEXT_MODEL, messages: [] });

  assert.equal(calls.length, 2);
  assert.equal(calls[1].model, TEXT_MODEL_FALLBACK);
  assert.equal(result.model, TEXT_MODEL_FALLBACK);
});

test('empty-string content with finish_reason length triggers retry with fallback model', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    if (calls.length === 1) {
      return { model: params.model, choices: [{ message: { content: '' }, finish_reason: 'length' }] };
    }
    return { model: params.model, choices: [{ message: { content: 'fallback ok' } }] };
  });

  const result = await createChatCompletion({ model: TEXT_MODEL, messages: [] });

  assert.equal(calls.length, 2);
  assert.equal(calls[1].model, TEXT_MODEL_FALLBACK);
  assert.equal(result.model, TEXT_MODEL_FALLBACK);
});

test('no choices array triggers retry with fallback model', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    if (calls.length === 1) {
      return { model: params.model };
    }
    return { model: params.model, choices: [{ message: { content: 'fallback ok' } }] };
  });

  const result = await createChatCompletion({ model: TEXT_MODEL, messages: [] });

  assert.equal(calls.length, 2);
  assert.equal(calls[1].model, TEXT_MODEL_FALLBACK);
  assert.equal(result.model, TEXT_MODEL_FALLBACK);
});

test('fallback also empty/error-shaped throws OpenAIError', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    if (calls.length === 1) {
      return { model: params.model, choices: [{ message: { content: null }, finish_reason: 'length' }] };
    }
    return { error: { message: 'still broken' } };
  });

  await assert.rejects(
    () => createChatCompletion({ model: TEXT_MODEL, messages: [] }),
    /Empty completion from model/
  );
  assert.equal(calls.length, 2);
});

test('normal response with finish_reason stop passes through untouched', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    return { model: params.model, choices: [{ message: { content: 'all good' }, finish_reason: 'stop' }] };
  });

  const result = await createChatCompletion({ model: TEXT_MODEL, messages: [] });

  assert.equal(calls.length, 1);
  assert.equal(result.choices[0].message.content, 'all good');
});

test('empty content with finish_reason stop still triggers retry with fallback model', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    if (calls.length === 1) {
      return { model: params.model, choices: [{ message: { content: '' }, finish_reason: 'stop' }] };
    }
    return { model: params.model, choices: [{ message: { content: 'fallback ok' } }] };
  });

  const result = await createChatCompletion({ model: TEXT_MODEL, messages: [] });

  assert.equal(calls.length, 2);
  assert.equal(calls[1].model, TEXT_MODEL_FALLBACK);
  assert.equal(result.model, TEXT_MODEL_FALLBACK);
});

test('429 on first call followed by an empty-shaped fallback response throws OpenAIError, not a raw empty response, and makes only 2 calls', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    if (calls.length === 1) {
      const err = new Error('rate limited');
      err.status = 429;
      throw err;
    }
    return { model: params.model, choices: [{ message: { content: null }, finish_reason: 'length' }] };
  });

  await assert.rejects(
    () => createChatCompletion({ model: TEXT_MODEL, messages: [] }),
    /Empty completion from model/
  );
  assert.equal(calls.length, 2);
});
