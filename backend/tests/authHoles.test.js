import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

// Not a real credential: a fixture value for the school-code check, set
// before importing server.js so dotenv (which doesn't override existing
// vars) can't clobber this with whatever's in a local .env file.
const TEST_SCHOOL_CODE = ['test', 'school', 'code', 'fixture'].join('-');
process.env.SESSION_PASSWORD = TEST_SCHOOL_CODE;

const { default: app } = await import('../src/server.js');
const { __resetDailyCap } = await import('../src/middleware/abuseGuards.js');
const { __setChatCompletionOverride } = await import('../src/services/openai.js');

let server;
let baseUrl;
let llmCallCount;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
});

beforeEach(() => {
  __resetDailyCap(10_000);
  llmCallCount = 0;
  __setChatCompletionOverride(async () => {
    llmCallCount += 1;
    return {
      choices: [{ message: { content: '{}' } }]
    };
  });
});

afterEach(() => {
  __setChatCompletionOverride(null);
});

test('POST /api/sessions/:code/problems with an unknown session code is rejected with 404 and never touches the LLM', async () => {
  const unknownCode = 'ZZZZZZ'; // well-formed but never created

  const res = await fetch(`${baseUrl}/api/sessions/${unknownCode}/problems`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '2 + 2 = ?' })
  });

  assert.equal(res.status, 404);
  assert.equal(llmCallCount, 0, 'expected no LLM calls for an unknown session code');

  // Confirm the auto-create hole is closed: the session must not have been
  // created as a side effect of the problems POST.
  const getRes = await fetch(
    `${baseUrl}/api/sessions/${unknownCode}?school_code=${encodeURIComponent(TEST_SCHOOL_CODE)}`
  );
  assert.equal(getRes.status, 404, 'expected no session to have been auto-created');
});

test('POST /api/sessions/:code/chat with an unknown session code is rejected with 404 and never touches the LLM', async () => {
  const unknownCode = 'YYYYYY'; // well-formed but never created

  const res = await fetch(`${baseUrl}/api/sessions/${unknownCode}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hello' })
  });

  assert.equal(res.status, 404);
  assert.equal(llmCallCount, 0, 'expected no LLM calls for an unknown session code');
});
