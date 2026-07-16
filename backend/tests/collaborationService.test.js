import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionStore } from '../src/services/memoryStore.js';
import {
  createCollaborationSession,
  getCollaborationSession,
  addCollaborationMessage,
  updateCanvasState,
  updateDrawingPermission,
  endCollaboration,
  getCollaborationUpdates
} from '../src/services/collaborationService.js';

function seedStudentSession(sessionCode) {
  sessionStore.put(sessionCode, {
    session_code: sessionCode,
    created_at: new Date().toISOString(),
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    problems: [],
    transcript: [],
    streak_progress: 0,
    streak_completions: 0
  });
}

test('createCollaborationSession then getCollaborationSession roundtrip returns expected shape', async () => {
  seedStudentSession('STU001');

  const created = await createCollaborationSession('STU001', 'P001', 'A similar problem');
  assert.ok(created.session_code.startsWith('COLLAB'));
  assert.equal(created.collaboration_session_id, created.session_code);
  assert.equal(created.student_session_id, 'STU001');
  assert.equal(created.selected_problem_id, 'P001');
  assert.equal(created.problem_text, 'A similar problem');
  assert.deepEqual(created.messages, []);
  assert.equal(created.canvas_state, null);
  assert.equal(created.student_can_draw, false);
  assert.equal(created.status, 'active');
  assert.equal(typeof created.created_at, 'string');
  assert.equal(typeof created.expires_at, 'number');

  const fetched = await getCollaborationSession(created.session_code);
  assert.deepEqual(fetched, created);
});

test('createCollaborationSession sets collaboration flags on the student session', async () => {
  seedStudentSession('STU002');

  const created = await createCollaborationSession('STU002', 'P001', 'Another problem');

  const studentSession = sessionStore.get('STU002');
  assert.equal(studentSession.collaboration_requested, true);
  assert.equal(studentSession.collaboration_session_id, created.session_code);
});

test('createCollaborationSession rejects a second active collaboration for the same student', async () => {
  seedStudentSession('STU003');
  await createCollaborationSession('STU003', 'P001', 'First problem');

  await assert.rejects(
    () => createCollaborationSession('STU003', 'P002', 'Second problem'),
    (err) => {
      assert.equal(err.message, 'Student already has an active collaboration session');
      assert.equal(typeof err.existingCollaborationId, 'string');
      return true;
    }
  );
});

test('getCollaborationSession on missing session throws NotFoundError("Collaboration session")', async () => {
  await assert.rejects(
    () => getCollaborationSession('COLLABZZZZZZ'),
    (err) => {
      assert.equal(err.name, 'NotFoundError');
      assert.equal(err.message, 'Collaboration session not found');
      assert.equal(err.statusCode, 404);
      return true;
    }
  );
});

test('getCollaborationSession rejects an ID without the COLLAB prefix', async () => {
  await assert.rejects(
    () => getCollaborationSession('BADID1'),
    (err) => {
      assert.equal(err.message, 'Invalid collaboration session ID format');
      return true;
    }
  );
});

test('addCollaborationMessage appends a message and preserves other fields', async () => {
  seedStudentSession('STU004');
  const created = await createCollaborationSession('STU004', 'P001', 'A problem');

  const updated = await addCollaborationMessage(created.session_code, 'teacher', 'Hello there');
  assert.equal(updated.messages.length, 1);
  assert.equal(updated.messages[0].speaker, 'teacher');
  assert.equal(updated.messages[0].message, 'Hello there');
  assert.equal(updated.messages[0].canvas_update, null);
  assert.equal(updated.session_code, created.session_code);
  assert.equal(updated.status, 'active');

  const updated2 = await addCollaborationMessage(created.session_code, 'student', 'Hi back', { path: [] });
  assert.equal(updated2.messages.length, 2);
  assert.deepEqual(updated2.canvas_state, { path: [] });
});

test('updateCanvasState merges canvas_state and preserves messages', async () => {
  seedStudentSession('STU005');
  const created = await createCollaborationSession('STU005', 'P001', 'A problem');
  await addCollaborationMessage(created.session_code, 'teacher', 'Hello');

  const updated = await updateCanvasState(created.session_code, { shapes: ['circle'] });
  assert.deepEqual(updated.canvas_state, { shapes: ['circle'] });
  assert.equal(updated.messages.length, 1);
});

test('updateDrawingPermission toggles student_can_draw and preserves other fields', async () => {
  seedStudentSession('STU006');
  const created = await createCollaborationSession('STU006', 'P001', 'A problem');

  const updated = await updateDrawingPermission(created.session_code, true);
  assert.equal(updated.student_can_draw, true);
  assert.equal(updated.status, 'active');
});

test('endCollaboration sets status completed, records ended_at, and clears student flags', async () => {
  seedStudentSession('STU007');
  const created = await createCollaborationSession('STU007', 'P001', 'A problem');

  const ended = await endCollaboration(created.session_code);
  assert.equal(ended.status, 'completed');
  assert.equal(typeof ended.ended_at, 'string');

  const studentSession = sessionStore.get('STU007');
  assert.equal(studentSession.collaboration_requested, false);
  assert.equal(studentSession.collaboration_session_id, null);
});

test('getCollaborationUpdates filters messages strictly after the given timestamp', async () => {
  seedStudentSession('STU008');
  const created = await createCollaborationSession('STU008', 'P001', 'A problem');

  const first = await addCollaborationMessage(created.session_code, 'teacher', 'First');
  const cutoff = first.messages[0].timestamp;
  await new Promise((resolve) => setTimeout(resolve, 5));
  await addCollaborationMessage(created.session_code, 'student', 'Second');

  const updates = await getCollaborationUpdates(created.session_code, cutoff);
  assert.equal(updates.messages.length, 1);
  assert.equal(updates.messages[0].message, 'Second');
  assert.equal(updates.status, 'active');
  assert.equal(updates.student_can_draw, false);
});
