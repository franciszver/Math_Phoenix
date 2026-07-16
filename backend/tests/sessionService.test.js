import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession,
  getSession,
  updateSession,
  deleteSession
} from '../src/services/sessionService.js';

test('createSession then getSession roundtrip returns expected shape', async () => {
  const session = await createSession('AAA111');
  assert.equal(session.session_code, 'AAA111');
  assert.deepEqual(session.problems, []);
  assert.deepEqual(session.transcript, []);
  assert.equal(typeof session.created_at, 'string');
  assert.equal(typeof session.expires_at, 'number');

  const fetched = await getSession('AAA111');
  assert.deepEqual(fetched, session);
});

test('getSession on missing session throws NotFoundError("Session")', async () => {
  await assert.rejects(
    () => getSession('BBB222'),
    (err) => {
      assert.equal(err.name, 'NotFoundError');
      assert.equal(err.message, 'Session not found');
      assert.equal(err.statusCode, 404);
      return true;
    }
  );
});

test('updateSession merges top-level fields and preserves others', async () => {
  await createSession('CCC333');
  const updated = await updateSession('CCC333', { streak_progress: 40 });
  assert.equal(updated.streak_progress, 40);
  assert.equal(updated.session_code, 'CCC333');
  assert.deepEqual(updated.problems, []);
  assert.deepEqual(updated.transcript, []);

  const fetched = await getSession('CCC333');
  assert.deepEqual(fetched, updated);
});

test('deleteSession then getSession throws not-found', async () => {
  await createSession('DDD444');
  await deleteSession('DDD444');

  await assert.rejects(
    () => getSession('DDD444'),
    (err) => {
      assert.equal(err.name, 'NotFoundError');
      assert.equal(err.message, 'Session not found');
      return true;
    }
  );
});
