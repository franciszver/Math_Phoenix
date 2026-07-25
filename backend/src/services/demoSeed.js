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
 * Derive a session's transcript from its steps: the student's original
 * raw_input first, then each step's tutor_prompt/student_response pair in
 * order. Keeps transcript in sync with steps instead of hand-copying text.
 * @param {string} rawInput - The student's original problem submission.
 * @param {Array<Object>} steps - Problem steps (tutor_prompt/student_response/timestamp).
 * @returns {Array<Object>} Transcript entries ({ speaker, message, timestamp }).
 */
function transcriptFromSteps(rawInput, steps) {
  const openingTimestamp = steps[0]?.timestamp ?? new Date().toISOString();
  const transcript = [{ speaker: 'student', message: rawInput, timestamp: openingTimestamp }];

  steps.forEach(step => {
    transcript.push({ speaker: 'tutor', message: step.tutor_prompt, timestamp: step.timestamp });
    transcript.push({ speaker: 'student', message: step.student_response, timestamp: step.timestamp });
  });

  return transcript;
}

/**
 * Build the 4 synthetic demo sessions. Content is frozen (no LLM calls).
 * @returns {Array<Object>} Session objects, shaped like sessionService.createSession() output.
 */
function buildDemoSessions() {
  const now = new Date().toISOString();
  const expires_at = futureExpiry();

  // 1) DEMO01 — "Demo: Ava (sample)" — completed problem, MC quiz + transfer passed.
  const demo01RawInput = 'Solve for x: 2x + 3 = 11';
  const demo01Steps = [
    {
      step_number: 1,
      tutor_prompt: 'What operation would undo adding 3 to 2x?',
      student_response: 'Subtract 3 from both sides',
      timestamp: now
    },
    {
      step_number: 2,
      tutor_prompt: 'Good! Now 2x = 8. What do we do next?',
      student_response: 'Divide both sides by 2, so x = 4',
      timestamp: now
    }
  ];
  const demo01 = {
    session_code: 'DEMO01',
    student_name: 'Demo: Ava (sample)',
    created_at: now,
    expires_at,
    problems: [
      {
        problem_id: 'P001',
        raw_input: demo01RawInput,
        normalized_latex: '2x + 3 = 11',
        category: 'algebra',
        difficulty: 'easy',
        completed: true,
        created_at: now,
        hints_used_total: 0,
        steps: demo01Steps,
        learning_assessment: {
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
          transfer_success: true,
          learning_confidence: 0.95,
          assessment_completed: true,
          assessed_at: now
        }
      }
    ],
    transcript: transcriptFromSteps(demo01RawInput, demo01Steps),
    streak_progress: 0,
    streak_completions: 1
  };

  // 2) DEMO02 — "Demo: Ben (sample)" — mid-Socratic conversation, a few turns, not yet complete.
  const demo02RawInput = 'A baker made 24 cupcakes. She sold 15 of them. How many cupcakes are left?';
  const demo02Steps = [
    {
      step_number: 1,
      tutor_prompt: 'What operation do we use when something is taken away?',
      student_response: 'Add them?',
      timestamp: now
    },
    {
      step_number: 2,
      tutor_prompt: 'Not quite - when cupcakes are sold, they are removed from the total. Try subtraction: 24 minus 15.',
      student_response: 'Oh, 24 - 15 = 9',
      timestamp: now
    }
  ];
  const demo02 = {
    session_code: 'DEMO02',
    student_name: 'Demo: Ben (sample)',
    created_at: now,
    expires_at,
    current_problem_id: 'P001',
    problems: [
      {
        problem_id: 'P001',
        raw_input: demo02RawInput,
        normalized_latex: '24 - 15',
        category: 'word',
        difficulty: 'very_easy',
        completed: false,
        created_at: now,
        hints_used_total: 1,
        steps: demo02Steps
      }
    ],
    transcript: transcriptFromSteps(demo02RawInput, demo02Steps),
    streak_progress: 20,
    streak_completions: 0
  };

  // 3) DEMO03 — "Demo: Chloe (sample)" — just-started, no steps taken yet.
  const demo03RawInput = 'What is the perimeter of a rectangle with length 8 cm and width 3 cm?';
  const demo03Steps = [];
  const demo03 = {
    session_code: 'DEMO03',
    student_name: 'Demo: Chloe (sample)',
    created_at: now,
    expires_at,
    current_problem_id: 'P001',
    problems: [
      {
        problem_id: 'P001',
        raw_input: demo03RawInput,
        normalized_latex: '2(8 + 3)',
        category: 'geometry',
        difficulty: 'easy',
        completed: false,
        created_at: now,
        hints_used_total: 0,
        steps: demo03Steps
      }
    ],
    transcript: [
      ...transcriptFromSteps(demo03RawInput, demo03Steps),
      { speaker: 'tutor', message: 'A rectangle has two pairs of equal sides. What formula relates length and width to perimeter?', timestamp: now }
    ],
    streak_progress: 0,
    streak_completions: 0
  };

  // 4) DEMO04 — "Demo: Diego (sample)" — photo-flow example (image_url always null; text as if OCR'd).
  const demo04RawInput = 'Find the area of a triangle with base 10 in and height 6 in.';
  const demo04Steps = [
    {
      step_number: 1,
      tutor_prompt: 'What formula do we use to find the area of a triangle?',
      student_response: 'Area = 1/2 x base x height',
      timestamp: now
    }
  ];
  const demo04 = {
    session_code: 'DEMO04',
    student_name: 'Demo: Diego (sample)',
    created_at: now,
    expires_at,
    current_problem_id: 'P001',
    problems: [
      {
        problem_id: 'P001',
        raw_input: demo04RawInput,
        normalized_latex: '\\frac{1}{2} \\times 10 \\times 6',
        category: 'geometry',
        difficulty: 'easy',
        completed: false,
        created_at: now,
        hints_used_total: 0,
        image_url: null,
        steps: demo04Steps
      }
    ],
    transcript: transcriptFromSteps(demo04RawInput, demo04Steps),
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
