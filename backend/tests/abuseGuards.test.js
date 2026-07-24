import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  perIpLimiter,
  dailyCapGuard,
  __resetDailyCap,
  __setNow
} from '../src/middleware/abuseGuards.js';

function makeApp(...middleware) {
  const app = express();
  app.get('/guarded', ...middleware, (req, res) => res.status(200).json({ ok: true }));
  return app;
}

async function listen(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

afterEach(() => {
  __resetDailyCap();
  __setNow(null);
});

test('perIpLimiter: 11th request within a minute from same IP is blocked with 429', async () => {
  const app = makeApp(perIpLimiter);
  const { server, baseUrl } = await listen(app);

  try {
    const statuses = [];
    for (let i = 0; i < 11; i++) {
      const res = await fetch(`${baseUrl}/guarded`);
      statuses.push(res.status);
      if (i === 10) {
        const body = await res.json();
        assert.deepEqual(body, { error: 'Too many requests, please try again later.' });
      }
    }

    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(200));
    assert.equal(statuses[10], 429);
  } finally {
    server.close();
  }
});

test('dailyCapGuard: request past the cap is blocked with 429', async () => {
  __resetDailyCap(2);
  const app = makeApp(dailyCapGuard);
  const { server, baseUrl } = await listen(app);

  try {
    const first = await fetch(`${baseUrl}/guarded`);
    const second = await fetch(`${baseUrl}/guarded`);
    const third = await fetch(`${baseUrl}/guarded`);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
    assert.deepEqual(await third.json(), {
      error: 'Daily demo AI limit reached, please try again tomorrow.'
    });
  } finally {
    server.close();
  }
});

test('dailyCapGuard: resets and allows requests again on a simulated new day', async () => {
  __resetDailyCap(1);
  __setNow(() => new Date('2026-07-24T12:00:00Z'));
  const app = makeApp(dailyCapGuard);
  const { server, baseUrl } = await listen(app);

  try {
    const day1First = await fetch(`${baseUrl}/guarded`);
    assert.equal(day1First.status, 200);

    const day1Second = await fetch(`${baseUrl}/guarded`);
    assert.equal(day1Second.status, 429);

    __setNow(() => new Date('2026-07-25T00:00:01Z'));

    const day2First = await fetch(`${baseUrl}/guarded`);
    assert.equal(day2First.status, 200);
  } finally {
    server.close();
  }
});
