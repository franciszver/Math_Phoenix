/**
 * Demo Data Generation Script
 * Generates realistic demo data for Math_Phoenix teacher dashboard
 * 
 * Usage:
 *   cd backend
 *   npm run generate-demo-data [--count=20] [--clear] [--days=7]
 * 
 * Options:
 *   --count=N    Number of sessions to generate (default: 20)
 *   --clear      Clear existing data before generating (default: false)
 *   --days=N     Number of days to spread sessions over (default: 7)
 */

import '../src/config/env.js';
import { dynamoDocClient } from '../src/services/aws.js';
import { 
  createSession, 
  addProblemToSession,
  addStepToProblem,
  addToTranscript,
  updateSession,
  getSession
} from '../src/services/sessionService.js';
import { processProblem } from '../src/services/problemService.js';
import { ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { createLogger } from '../src/utils/logger.js';

const logger = createLogger();
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'math-phoenix-sessions';

// Sample problems by category
const SAMPLE_PROBLEMS = {
  arithmetic: [
    '15 + 23 = ?',
    '45 × 6 = ?',
    'What is 144 ÷ 12?',
    'Calculate 7 + 8 + 9',
    'What is 25 × 4?',
    'Find the sum of 12, 18, and 24'
  ],
  algebra: [
    '2x + 5 = 13',
    'Solve for y: 3y - 7 = 14',
    'If x = 5, what is 2x + 3?',
    'Solve for x: 4x - 8 = 12',
    'If 2a + 3 = 11, what is a?',
    'Solve: 5x + 2 = 17'
  ],
  geometry: [
    'Find the area of a circle with radius 5',
    'What is the perimeter of a rectangle with length 8 and width 5?',
    'Find the area of a triangle with base 10 and height 6',
    'What is the area of a square with side length 7?',
    'Find the circumference of a circle with radius 4',
    'What is the perimeter of a square with side length 9?'
  ],
  word: [
    'If John has 15 apples and gives away 3, how many does he have left?',
    'A train travels 120 miles in 2 hours. What is its speed?',
    'Sarah bought 5 books at $12 each. How much did she spend?',
    'Tom has 24 cookies. He wants to share them equally among 6 friends. How many does each friend get?',
    'A store sells 30 items on Monday and 45 items on Tuesday. How many items did they sell in total?',
    'Maria has $50. She spends $18 on groceries. How much money does she have left?'
  ],
  'multi-step': [
    'Sarah has $50. She buys 3 books at $12 each. How much money does she have left?',
    'A rectangle has length 8 and width 5. What is its area? If the length is doubled, what is the new area?',
    'John has 30 apples. He gives 5 to his sister and 8 to his brother. How many apples does he have left?',
    'A box contains 24 chocolates. If you eat 3 chocolates each day, how many days will the box last?',
    'A train travels 180 miles in 3 hours. What is its speed? If it continues at this speed for 2 more hours, how far will it travel?'
  ]
};

// Realistic tutor prompts (Socratic style)
const TUTOR_PROMPTS = {
  initial: [
    "What are we trying to find in this problem?",
    "What information do we have?",
    "Let's break this down. What's the first step?",
    "What operation might help us solve this?",
    "Can you identify what we're looking for?"
  ],
  guiding: [
    "Good thinking! What should we do next?",
    "That's right. Now, what operation do we need?",
    "Exactly! How can we simplify this?",
    "Perfect. What's the next step?",
    "You're on the right track. What comes next?"
  ],
  hint: [
    "Let me give you a hint: think about what operation we need to use.",
    "Here's a clue: what number do we need to solve for?",
    "Try thinking about this: what's the opposite operation?",
    "A hint: remember the order of operations.",
    "Let's think differently: what if we rearrange the equation?"
  ],
  validation: [
    "That's correct! Great job!",
    "Exactly right! You've got it!",
    "Perfect! That's the answer!",
    "Yes, that's correct! Well done!",
    "That's right! Excellent work!"
  ]
};

// Realistic student responses
const STUDENT_RESPONSES = {
  progress: [
    "I think it's {answer}",
    "The answer should be {answer}",
    "I got {answer}",
    "It's {answer} because {reason}",
    "I think we need to {operation}",
    "We should {operation} first"
  ],
  understanding: [
    "We need to find {variable}",
    "We have {info}",
    "We should {action}",
    "I think we need to {operation}",
    "Let me {action}"
  ],
  stuck: [
    "I'm not sure",
    "I don't know",
    "Can you help me?",
    "I'm stuck",
    "I need help with this"
  ],
  final: [
    "The answer is {answer}",
    "I think it's {answer}",
    "It should be {answer}",
    "{answer}",
    "The solution is {answer}"
  ]
};

// Generate realistic tutor prompt
function generateTutorPrompt(stepNumber, hintUsed, progressMade, isFinal) {
  if (isFinal) {
    return TUTOR_PROMPTS.validation[Math.floor(Math.random() * TUTOR_PROMPTS.validation.length)];
  }
  if (hintUsed) {
    return TUTOR_PROMPTS.hint[Math.floor(Math.random() * TUTOR_PROMPTS.hint.length)];
  }
  if (stepNumber === 1) {
    return TUTOR_PROMPTS.initial[Math.floor(Math.random() * TUTOR_PROMPTS.initial.length)];
  }
  if (progressMade) {
    return TUTOR_PROMPTS.guiding[Math.floor(Math.random() * TUTOR_PROMPTS.guiding.length)];
  }
  return TUTOR_PROMPTS.initial[Math.floor(Math.random() * TUTOR_PROMPTS.initial.length)];
}

// Generate realistic student response
function generateStudentResponse(stepNumber, totalSteps, hintUsed, progressMade, isFinal, problemText) {
  if (isFinal) {
    // Extract answer from problem (simple extraction)
    const answerMatch = problemText.match(/(\d+)/);
    const answer = answerMatch ? answerMatch[1] : '10';
    const response = STUDENT_RESPONSES.final[Math.floor(Math.random() * STUDENT_RESPONSES.final.length)];
    return response.replace('{answer}', answer);
  }
  if (hintUsed && !progressMade) {
    return STUDENT_RESPONSES.stuck[Math.floor(Math.random() * STUDENT_RESPONSES.stuck.length)];
  }
  if (progressMade) {
    const response = STUDENT_RESPONSES.progress[Math.floor(Math.random() * STUDENT_RESPONSES.progress.length)];
    // Simple answer extraction
    const answerMatch = problemText.match(/(\d+)/);
    const answer = answerMatch ? answerMatch[1] : '5';
    return response.replace('{answer}', answer).replace('{reason}', 'that makes sense');
  }
  return STUDENT_RESPONSES.understanding[Math.floor(Math.random() * STUDENT_RESPONSES.understanding.length)];
}

// Clear existing sessions
async function clearExistingSessions() {
  logger.info('Clearing existing sessions...');
  try {
    const sessions = [];
    let lastEvaluatedKey = null;

    // Scan all sessions
    do {
      const params = {
        TableName: TABLE_NAME
      };

      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }

      const result = await dynamoDocClient.send(new ScanCommand(params));
      
      if (result.Items) {
        sessions.push(...result.Items);
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // Delete all sessions
    for (const session of sessions) {
      await dynamoDocClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { session_code: session.session_code }
        })
      );
    }

    logger.info(`Cleared ${sessions.length} existing sessions`);
  } catch (error) {
    logger.error('Error clearing sessions:', error);
    throw error;
  }
}

// Generate step data for a problem (returns step objects to be added via addStepToProblem)
function generateStepData(problem, totalSteps) {
  const stepData = [];
  let stuckTurns = 0;

  for (let i = 0; i < totalSteps; i++) {
    const stepNumber = i + 1;
    const isFinal = stepNumber === totalSteps;
    
    // Determine if hint is needed (after 2 stuck turns)
    const needsHint = stuckTurns >= 2 && !isFinal;
    const hintUsed = needsHint && Math.random() > 0.3; // 70% chance of using hint when needed
    
    // Determine progress (more likely in later steps, less likely if hint used)
    const progressMade = !isFinal && (
      (stepNumber > 1 && !hintUsed && Math.random() > 0.3) || 
      (stepNumber > 2 && Math.random() > 0.5)
    );

    if (hintUsed) {
      stuckTurns = 0; // Reset after hint
    } else if (progressMade) {
      stuckTurns = 0;
    } else {
      stuckTurns++;
    }

    const tutorPrompt = generateTutorPrompt(stepNumber, hintUsed, progressMade, isFinal);
    const studentResponse = generateStudentResponse(
      stepNumber, 
      totalSteps, 
      hintUsed, 
      progressMade, 
      isFinal, 
      problem.raw_input
    );

    stepData.push({
      tutor_prompt: tutorPrompt,
      student_response: studentResponse,
      hint_used: hintUsed,
      progress_made: progressMade,
      stuck_turns: stuckTurns
    });
  }

  return stepData;
}

// Generate a single session with problems
async function generateSession(sessionIndex, totalSessions, daysSpread) {
  const now = Date.now();
  const daysAgo = (daysSpread * (totalSessions - sessionIndex)) / totalSessions;
  const createdDate = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
  
  // Create session
  const session = await createSession();
  
  // Update created_at to spread over time
  const expiresAt = new Date(createdDate);
  expiresAt.setDate(expiresAt.getDate() + 30);
  
  await updateSession(session.session_code, {
    created_at: createdDate.toISOString(),
    expires_at: Math.floor(expiresAt.getTime() / 1000)
  });

  // Generate 1-5 problems per session
  const numProblems = Math.floor(Math.random() * 5) + 1;
  const categories = ['arithmetic', 'algebra', 'geometry', 'word', 'multi-step'];

  for (let p = 0; p < numProblems; p++) {
    // Select random category
    const category = categories[Math.floor(Math.random() * categories.length)];
    const problemText = SAMPLE_PROBLEMS[category][
      Math.floor(Math.random() * SAMPLE_PROBLEMS[category].length)
    ];

    // Process problem to get proper categorization
    let processedProblem;
    try {
      processedProblem = await processProblem(problemText);
    } catch (error) {
      logger.warn(`Failed to process problem, using fallback: ${error.message}`);
      // Fallback categorization
      processedProblem = {
        raw_input: problemText,
        normalized_latex: problemText,
        category: category,
        difficulty: ['very_easy', 'easy', 'medium', 'hard', 'very_hard'][
          Math.floor(Math.random() * 5)
        ]
      };
    }

    // Set created_at for problem
    processedProblem.created_at = new Date(createdDate.getTime() + p * 10 * 60 * 1000).toISOString(); // 10 min apart

    // Add problem to session (this creates the problem and sets current_problem_id)
    const updatedSession = await addProblemToSession(session.session_code, processedProblem);
    
    // Add initial transcript entry (student submits problem)
    await addToTranscript(session.session_code, 'student', problemText);

    // Get the current problem to add steps
    const currentProblem = updatedSession.problems.find(
      p => p.problem_id === updatedSession.current_problem_id
    );

    // Generate step data (2-8 steps per problem)
    const numSteps = Math.floor(Math.random() * 7) + 2;
    const stepData = generateStepData(processedProblem, numSteps);

    // Add initial tutor prompt (first step's tutor prompt comes before student response)
    if (stepData.length > 0) {
      await addToTranscript(session.session_code, 'tutor', stepData[0].tutor_prompt);
    }

    // Add each step using addStepToProblem (this automatically handles streak meter)
    for (let s = 0; s < stepData.length; s++) {
      const step = stepData[s];
      
      // For first step, student_response might be null initially, but we'll generate one
      // Add step to problem
      await addStepToProblem(session.session_code, step);
      
      // Add student response to transcript if present
      if (step.student_response) {
        await addToTranscript(session.session_code, 'student', step.student_response);
      }
      
      // Add next tutor prompt if not the last step
      if (s < stepData.length - 1 && stepData[s + 1]) {
        await addToTranscript(session.session_code, 'tutor', stepData[s + 1].tutor_prompt);
      }
    }

    // Mark problem as completed if not the last problem (or 70% chance if it's the last)
    const shouldComplete = p < numProblems - 1 || Math.random() > 0.3;
    
    if (shouldComplete) {
      // Get current session to update problem
      const currentSession = await getSession(session.session_code);
      const problemToUpdate = currentSession.problems.find(
        prob => prob.problem_id === currentProblem.problem_id
      );
      
      if (problemToUpdate) {
        problemToUpdate.completed = true;
        
        // Update problems array
        const updatedProblems = currentSession.problems.map(prob =>
          prob.problem_id === problemToUpdate.problem_id ? problemToUpdate : prob
        );
        
        // Clear current_problem_id when completing a problem (so next problem can be started)
        await updateSession(session.session_code, {
          problems: updatedProblems,
          current_problem_id: null
        });
      }
    }
  }

  return session;
}

// Main function
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let count = 20;
  let clear = false;
  let days = 7;

  for (const arg of args) {
    if (arg.startsWith('--count=')) {
      count = parseInt(arg.split('=')[1]) || 20;
    } else if (arg === '--clear') {
      clear = true;
    } else if (arg.startsWith('--days=')) {
      days = parseInt(arg.split('=')[1]) || 7;
    }
  }

  logger.info('Starting demo data generation...');
  logger.info(`Configuration: count=${count}, clear=${clear}, days=${days}`);

  try {
    // Clear existing data if requested
    if (clear) {
      await clearExistingSessions();
    }

    // Generate sessions
    logger.info(`Generating ${count} sessions...`);
    for (let i = 0; i < count; i++) {
      const session = await generateSession(i, count, days);
      logger.info(`Generated session ${i + 1}/${count}: ${session.session_code}`);
      
      // Small delay to avoid rate limiting
      if (i < count - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    logger.info('Demo data generation complete!');
  } catch (error) {
    logger.error('Error generating demo data:', error);
    process.exit(1);
  }
}

// Run if called directly
main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});

