import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

// Not a real credential: a fixture value for the school-code check, set
// before importing server.js so dotenv (which doesn't override existing
// vars) can't clobber this with whatever's in a local .env file.
const TEST_SCHOOL_CODE = ['test', 'school', 'code', 'fixture'].join('-');
process.env.SESSION_PASSWORD = TEST_SCHOOL_CODE;

const { default: app } = await import('../src/server.js');
const { __resetDailyCap } = await import('../src/middleware/abuseGuards.js');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
});

test('guarded route: the 11th request within a minute from one IP gets 429', async () => {
  __resetDailyCap(10_000); // keep the daily cap out of the way; only the per-IP limiter should trip

  const statuses = [];
  for (let i = 0; i < 11; i++) {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_code: TEST_SCHOOL_CODE })
    });
    statuses.push(res.status);
  }

  assert.ok(!statuses.slice(0, 10).includes(429), `expected no 429s in first 10 requests, got ${statuses}`);
  assert.equal(statuses[10], 429);
});

test('unguarded route: /health never 429s under the same burst', async () => {
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    const res = await fetch(`${baseUrl}/health`);
    statuses.push(res.status);
  }

  assert.ok(!statuses.includes(429), `expected no 429s from /health, got ${statuses}`);
});

test('CORS: dead CloudFront origin is blocked in production mode', async () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  try {
    const res = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://d3rfhzm2ptw0c2.cloudfront.net' }
    });

    assert.notEqual(
      res.headers.get('access-control-allow-origin'),
      'https://d3rfhzm2ptw0c2.cloudfront.net'
    );
    assert.equal(res.status, 500);
  } finally {
    process.env.NODE_ENV = previousEnv;
  }
});

test('CORS: localhost:5173 origin is still allowed', async () => {
  const res = await fetch(`${baseUrl}/health`, {
    headers: { Origin: 'http://localhost:5173' }
  });

  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(res.status, 200);
});
