/**
 * Demo Data Seed
 * Inserts a fixed set of synthetic, obviously-fake student sessions into the
 * in-memory store for demo/showcase purposes. No LLM calls — all content is
 * frozen, hand-written math at a grade-school level. Off by default; gated
 * by DEMO_SEED=true at boot (see server.js).
 */

/** Fixed session codes so re-seeding overwrites the same records (idempotent). */
export const DEMO_SESSION_CODES = ['DEMO01', 'DEMO02', 'DEMO03', 'DEMO04'];

/**
 * Decide whether demo data should be seeded at boot, based on environment.
 * Factored out from server.js so the gate logic is unit-testable without
 * spawning the server.
 * @param {NodeJS.ProcessEnv} env - Environment to check (defaults to process.env)
 * @returns {boolean}
 */
export function shouldSeedDemoData(env = process.env) {
  return env.DEMO_SEED === 'true';
}

function futureExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  return Math.floor(expiresAt.getTime() / 1000);
}

/**
 * Build the 4 synthetic demo sessions. Content is frozen (no LLM calls).
 * @returns {Array<Object>} Session objects, shaped like sessionService.createSession() output.
 */
function buildDemoSessions() {
  const now = new Date().toISOString();
  const expires_at = futureExpiry();

  // 1) DEMO01 — "Demo: Ava (sample)" — completed problem, MC quiz + transfer passed.
  const demo01 = {
    session_code: 'DEMO01',
    student_name: 'Demo: Ava (sample)',
    created_at: now,
    expires_at,
    problems: [
      {
        problem_id: 'P001',
        raw_input: 'Solve for x: 2x + 3 = 11',
        normalized_latex: '2x + 3 = 11',
        category: 'algebra',
        difficulty: 'easy',
        completed: true,
        created_at: now,
        hints_used_total: 0,
        steps: [
          {
            step_number: 1,
            tutor_prompt: 'What operation would undo adding 3 to 2x?',
            student_response: 'Subtract 3 from both sides',
            hint_used: false,
            progress_made: true,
            stuck_turns: 0,
            timestamp: now
          },
          {
            step_number: 2,
            tutor_prompt: 'Good! Now 2x = 8. What do we do next?',
            student_response: 'Divide both sides by 2, so x = 4',
            hint_used: false,
            progress_made: true,
            stuck_turns: 0,
            timestamp: now
          }
        ],
        learning_assessment: {
          approach_extracted: 'Isolate the variable by subtracting then dividing.',
          mc_questions: [
            {
              question_id: 'mcq-P001-0',
              question: 'How did we solve this problem?',
              options: ['Added numbers', 'Isolated the variable', 'Multiplied everything', 'Guessed'],
              correct_answer_index: 1,
              student_answer_index: 1,
              correct: true
            },
            {
              question_id: 'mcq-P001-1',
              question: 'What did we do first?',
              options: ['Subtracted 3', 'Multiplied by 5', 'Divided by 2', 'Added 10'],
              correct_answer_index: 0,
              student_answer_index: 0,
              correct: true
            }
          ],
          mc_score: 1,
          transfer_problem: {
            problem_text: 'Solve for x: 3x + 4 = 19',
            approach: 'Isolate the variable by subtracting then dividing.',
            original_problem_id: 'P001'
          },
          transfer_answer: 'Subtract 4, then divide by 3, so x = 5',
          transfer_success: true,
          learning_confidence: 0.95,
          assessment_completed: true,
          assessed_at: now
        }
      }
    ],
    transcript: [
      { speaker: 'student', message: 'Solve for x: 2x + 3 = 11', timestamp: now },
      { speaker: 'tutor', message: 'What operation would undo adding 3 to 2x?', timestamp: now },
      { speaker: 'student', message: 'Subtract 3 from both sides', timestamp: now },
      { speaker: 'tutor', message: 'Good! Now 2x = 8. What do we do next?', timestamp: now },
      { speaker: 'student', message: 'Divide both sides by 2, so x = 4', timestamp: now }
    ],
    streak_progress: 0,
    streak_completions: 1
  };

  // 2) DEMO02 — "Demo: Ben (sample)" — mid-Socratic conversation, a few turns, not yet complete.
  const demo02 = {
    session_code: 'DEMO02',
    student_name: 'Demo: Ben (sample)',
    created_at: now,
    expires_at,
    current_problem_id: 'P001',
    problems: [
      {
        problem_id: 'P001',
        raw_input: 'A baker made 24 cupcakes. She sold 15 of them. How many cupcakes are left?',
        normalized_latex: '24 - 15',
        category: 'word',
        difficulty: 'very_easy',
        completed: false,
        created_at: now,
        hints_used_total: 1,
        steps: [
          {
            step_number: 1,
            tutor_prompt: 'What operation do we use when something is taken away?',
            student_response: 'Add them?',
            hint_used: true,
            progress_made: false,
            stuck_turns: 1,
            timestamp: now
          },
          {
            step_number: 2,
            tutor_prompt: 'Not quite - when cupcakes are sold, they are removed from the total. Try subtraction: 24 minus 15.',
            student_response: 'Oh, 24 - 15 = 9',
            hint_used: false,
            progress_made: true,
            stuck_turns: 0,
            timestamp: now
          }
        ]
      }
    ],
    transcript: [
      { speaker: 'student', message: 'A baker made 24 cupcakes. She sold 15 of them. How many cupcakes are left?', timestamp: now },
      { speaker: 'tutor', message: 'What operation do we use when something is taken away?', timestamp: now },
      { speaker: 'student', message: 'Add them?', timestamp: now },
      { speaker: 'tutor', message: 'Not quite - when cupcakes are sold, they are removed from the total. Try subtraction: 24 minus 15.', timestamp: now },
      { speaker: 'student', message: 'Oh, 24 - 15 = 9', timestamp: now }
    ],
    streak_progress: 20,
    streak_completions: 0
  };

  // 3) DEMO03 — "Demo: Chloe (sample)" — just-started, no steps taken yet.
  const demo03 = {
    session_code: 'DEMO03',
    student_name: 'Demo: Chloe (sample)',
    created_at: now,
    expires_at,
    current_problem_id: 'P001',
    problems: [
      {
        problem_id: 'P001',
        raw_input: 'What is the perimeter of a rectangle with length 8 cm and width 3 cm?',
        normalized_latex: '2(8 + 3)',
        category: 'geometry',
        difficulty: 'easy',
        completed: false,
        created_at: now,
        hints_used_total: 0,
        steps: []
      }
    ],
    transcript: [
      { speaker: 'student', message: 'What is the perimeter of a rectangle with length 8 cm and width 3 cm?', timestamp: now },
      { speaker: 'tutor', message: 'A rectangle has two pairs of equal sides. What formula relates length and width to perimeter?', timestamp: now }
    ],
    streak_progress: 0,
    streak_completions: 0
  };

  // 4) DEMO04 — "Demo: Diego (sample)" — photo-flow example (image_url always null; text as if OCR'd).
  const demo04 = {
    session_code: 'DEMO04',
    student_name: 'Demo: Diego (sample)',
    created_at: now,
    expires_at,
    current_problem_id: 'P001',
    problems: [
      {
        problem_id: 'P001',
        raw_input: 'Find the area of a triangle with base 10 in and height 6 in.',
        normalized_latex: '\\frac{1}{2} \\times 10 \\times 6',
        category: 'geometry',
        difficulty: 'easy',
        completed: false,
        created_at: now,
        hints_used_total: 0,
        image_url: null,
        steps: [
          {
            step_number: 1,
            tutor_prompt: 'What formula do we use to find the area of a triangle?',
            student_response: 'Area = 1/2 x base x height',
            hint_used: false,
            progress_made: true,
            stuck_turns: 0,
            timestamp: now
          }
        ]
      }
    ],
    transcript: [
      { speaker: 'student', message: 'Find the area of a triangle with base 10 in and height 6 in.', timestamp: now },
      { speaker: 'tutor', message: 'What formula do we use to find the area of a triangle?', timestamp: now },
      { speaker: 'student', message: 'Area = 1/2 x base x height', timestamp: now }
    ],
    streak_progress: 20,
    streak_completions: 0
  };

  return [demo01, demo02, demo03, demo04];
}

/**
 * Seed synthetic demo sessions into the given store. Deterministic (fixed
 * session codes), so calling this more than once simply overwrites the same
 * records rather than accumulating duplicates. Never makes an LLM call.
 * @param {ReturnType<import('./memoryStore.js').createStore>} store
 * @returns {number} Number of sessions seeded
 */
export function seedDemoData(store) {
  const sessions = buildDemoSessions();

  sessions.forEach(session => {
    store.put(session.session_code, session);
  });

  return sessions.length;
}
