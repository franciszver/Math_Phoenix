import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

const { default: app } = await import('../src/server.js');
const { perIpLimiter, dailyCapGuard } = await import('../src/middleware/abuseGuards.js');

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

function guardedRoutePaths(routeApp) {
  return routeApp._router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
      middleware: layer.route.stack.map((s) => s.handle)
    }));
}

test('perIpLimiter and dailyCapGuard are wired on all five LLM-triggering routes', () => {
  const routes = guardedRoutePaths(app);

  const llmRoutes = [
    { path: '/api/sessions', method: 'post' },
    { path: '/api/sessions/:code/problems', method: 'post' },
    { path: '/api/sessions/:code/problems/select', method: 'post' },
    { path: '/api/sessions/:code/chat', method: 'post' },
    { path: '/api/dashboard/sessions/:studentSessionId/similar-problems', method: 'get' }
  ];

  for (const { path, method } of llmRoutes) {
    const match = routes.find((r) => r.path === path && r.methods.includes(method));
    assert.ok(match, `expected route ${method.toUpperCase()} ${path} to be registered`);
    assert.ok(
      match.middleware.includes(perIpLimiter),
      `expected perIpLimiter on ${method.toUpperCase()} ${path}`
    );
    assert.ok(
      match.middleware.includes(dailyCapGuard),
      `expected dailyCapGuard on ${method.toUpperCase()} ${path}`
    );
  }
});

test('guards are NOT applied to /health or /api/dashboard/login', () => {
  const routes = guardedRoutePaths(app);

  const unguarded = [
    { path: '/health', method: 'get' },
    { path: '/api/dashboard/login', method: 'post' }
  ];

  for (const { path, method } of unguarded) {
    const match = routes.find((r) => r.path === path && r.methods.includes(method));
    assert.ok(match, `expected route ${method.toUpperCase()} ${path} to be registered`);
    assert.ok(
      !match.middleware.includes(perIpLimiter),
      `expected no perIpLimiter on ${method.toUpperCase()} ${path}`
    );
    assert.ok(
      !match.middleware.includes(dailyCapGuard),
      `expected no dailyCapGuard on ${method.toUpperCase()} ${path}`
    );
  }
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
