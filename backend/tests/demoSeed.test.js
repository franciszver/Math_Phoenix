import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/services/memoryStore.js';
import {
  shouldSeedDemoData,
  seedDemoData,
  DEMO_SESSION_CODES
} from '../src/services/demoSeed.js';
import {
  getAllSessions,
  getAllSessionsWithStats,
  getSessionDetails
} from '../src/services/dashboardService.js';

// dashboardService reads from the singleton sessionStore, so route seeding
// through it here rather than a fresh createStore() to exercise it the same
// way server.js does.
import { sessionStore } from '../src/services/memoryStore.js';

test('shouldSeedDemoData gate: unset/false env does not seed', () => {
  assert.equal(shouldSeedDemoData({}), false);
  assert.equal(shouldSeedDemoData({ DEMO_SEED: 'false' }), false);
  assert.equal(shouldSeedDemoData({ DEMO_SEED: '1' }), false);
});

test('shouldSeedDemoData gate: DEMO_SEED=true seeds', () => {
  assert.equal(shouldSeedDemoData({ DEMO_SEED: 'true' }), true);
});

test('seedDemoData inserts 4 sessions with obviously-fake student names, and they scan cleanly', () => {
  const store = createStore();
  const count = seedDemoData(store);

  assert.equal(count, 4);
  const all = store.scanAll();
  assert.equal(all.length, 4);
  all.forEach(session => {
    assert.match(session.student_name, /^Demo: .+\(sample\)$/);
    assert.ok(DEMO_SESSION_CODES.includes(session.session_code));
  });
});

test('seedDemoData records are retrievable via dashboardService with correct shape', async () => {
  DEMO_SESSION_CODES.forEach(code => sessionStore.delete(code));
  seedDemoData(sessionStore);

  try {
    const sessions = await getAllSessions();
    const codes = sessions.map(s => s.session_code);
    DEMO_SESSION_CODES.forEach(code => assert.ok(codes.includes(code), `expected ${code} in getAllSessions`));

    const withStats = await getAllSessionsWithStats();
    const demo01 = withStats.find(s => s.session_code === 'DEMO01');
    assert.ok(demo01, 'DEMO01 present in getAllSessionsWithStats');
    assert.equal(demo01.problems_count, 1);
    assert.equal(demo01.problems[0].completed, true);
    assert.ok(demo01.problems[0].learning_assessment, 'DEMO01 problem has a learning_assessment');
    assert.equal(demo01.problems[0].learning_assessment.transfer_success, true);
    assert.ok(demo01.problems[0].learning_assessment.mc_questions.length >= 2);

    const demo03Details = await getSessionDetails('DEMO03');
    assert.ok(demo03Details, 'DEMO03 resolves via getSessionDetails');
    assert.equal(demo03Details.problems.length, 1);
    assert.equal(demo03Details.problems[0].completed, false);
    assert.equal(demo03Details.transcript_length, demo03Details.transcript.length);

    const demo04Details = await getSessionDetails('DEMO04');
    assert.equal(demo04Details.problems[0].category, 'geometry');
  } finally {
    DEMO_SESSION_CODES.forEach(code => sessionStore.delete(code));
  }
});

test('seedDemoData is idempotent: seeding twice does not duplicate or error', () => {
  const store = createStore();
  seedDemoData(store);
  seedDemoData(store);

  const all = store.scanAll();
  assert.equal(all.length, 4);
  const codes = all.map(s => s.session_code).sort();
  assert.deepEqual(codes, [...DEMO_SESSION_CODES].sort());
});
