import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionStore } from '../src/services/memoryStore.js';
import { getAllSessions, getAggregateStats } from '../src/services/dashboardService.js';

test('getAllSessions returns seeded student and collab sessions from sessionStore', async () => {
  sessionStore.put('DASH001', {
    session_code: 'DASH001',
    created_at: new Date().toISOString(),
    problems: [
      {
        problem_id: 'p1',
        category: 'algebra',
        difficulty: 'medium',
        hints_used_total: 2,
        completed: true,
        learning_assessment: {
          assessment_completed: true,
          learning_confidence: 0.9,
          mc_score: 1,
          transfer_success: true
        }
      }
    ]
  });

  sessionStore.put('DASH002', {
    session_code: 'DASH002',
    created_at: new Date().toISOString(),
    problems: [
      {
        problem_id: 'p2',
        category: 'arithmetic',
        difficulty: 'easy',
        hints_used_total: 1,
        completed: false,
        learning_assessment: {
          assessment_completed: true,
          learning_confidence: 0.3,
          mc_score: 0.5,
          transfer_success: false
        }
      }
    ]
  });

  sessionStore.put('COLLAB-XYZ', {
    session_code: 'COLLAB-XYZ',
    created_at: new Date().toISOString(),
    problems: []
  });

  const sessions = await getAllSessions();
  const codes = sessions.map(s => s.session_code);
  assert.ok(codes.includes('DASH001'));
  assert.ok(codes.includes('DASH002'));
  assert.ok(codes.includes('COLLAB-XYZ'));

  const stats = await getAggregateStats();
  assert.equal(stats.totalProblems, 2);
  assert.equal(stats.totalHints, 3);
});
