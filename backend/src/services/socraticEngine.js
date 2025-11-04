/**
 * Socratic Dialogue Engine
 * Implements the Socratic tutoring approach with hint logic and progress tracking
 */

import '../config/env.js';
import { openai } from './openai.js';
import { createLogger } from '../utils/logger.js';
import { OpenAIError } from '../utils/errorHandler.js';

const logger = createLogger();

// Enhanced system prompt (from our discussion)
const SYSTEM_PROMPT = `You are a patient, encouraging math tutor for K-12 students. Your role is to guide students to discover solutions through Socratic questioning.

CRITICAL RULES:
1. NEVER give direct answers or solve problems for the student
2. Ask guiding questions that help students think through the problem
3. If a student is stuck after 2+ turns with no progress, provide a concrete hint (but still guide them to the answer)
4. Use encouraging, supportive language even when students make mistakes
5. Break complex problems into smaller, manageable steps
6. Acknowledge correct thinking and build on it
7. When students provide correct answers, validate and explain why it's correct

QUESTIONING STRATEGY:
- Start with: "What information do we have?" or "What are we trying to find?"
- Guide method selection: "What operation might help us here?"
- Step through: "What should we do next?" or "How can we simplify this?"
- Validate understanding: "Why does that work?" or "Can you explain your reasoning?"

TONE:
- Warm and encouraging
- Patient with mistakes
- Celebrate progress, even small steps
- Use age-appropriate language for K-12 students`;

/**
 * Analyze student response to determine progress
 * @param {string} studentResponse - Student's response
 * @param {Array} previousSteps - Previous conversation steps
 * @param {string} problemText - The problem text
 * @returns {Object} Progress analysis
 */
function analyzeProgress(studentResponse, previousSteps, problemText) {
  const response = studentResponse.toLowerCase().trim();
  
  // Indicators of progress
  const progressIndicators = [
    /correct|right|yes|that's it|exactly/i,
    /i (think|believe|know)/i,
    /\d+/, // Contains numbers (might be working on calculation)
    /because|since|so/i // Reasoning indicators
  ];

  // Indicators of being stuck
  const stuckIndicators = [
    /i don'?t know|i'm stuck|i can'?t|no idea|help/i,
    /(what|how|why)\s*\?/i, // Just asking questions back
    /^\s*$/, // Empty or very short responses
  ];

  let progressScore = 0;
  let stuckScore = 0;

  // Check for progress
  progressIndicators.forEach(pattern => {
    if (pattern.test(response)) {
      progressScore++;
    }
  });

  // Check for stuck
  stuckIndicators.forEach(pattern => {
    if (pattern.test(response)) {
      stuckScore++;
    }
  });

  // Determine if progress was made
  const madeProgress = progressScore > stuckScore && response.length > 3;

  return {
    madeProgress,
    progressScore,
    stuckScore,
    responseLength: response.length
  };
}

/**
 * Count consecutive turns without progress
 * @param {Array} steps - Conversation steps
 * @returns {number} Number of consecutive turns without progress
 */
function countStuckTurns(steps) {
  let stuckCount = 0;
  
  // Check from most recent backward
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    
    // If this step had progress, reset counter
    if (step.progress_made) {
      break;
    }
    
    // If this step had a hint, don't count it as stuck (hint was given)
    if (step.hint_used) {
      continue;
    }
    
    stuckCount++;
  }
  
  return stuckCount;
}

/**
 * Generate Socratic tutor response
 * @param {Object} context - Conversation context
 * @param {string} context.problemText - The problem text
 * @param {string} context.normalizedLatex - LaTeX normalized problem
 * @param {string} context.category - Problem category
 * @param {string} context.studentResponse - Student's current response
 * @param {Array} context.conversationHistory - Previous conversation steps
 * @param {boolean} context.shouldProvideHint - Whether to provide a hint
 * @returns {Promise<Object>} Tutor response with metadata
 */
export async function generateTutorResponse(context) {
  const {
    problemText,
    normalizedLatex,
    category,
    studentResponse,
    conversationHistory = [],
    shouldProvideHint = false
  } = context;

  // Build conversation history for context
  const messages = [
    {
      role: 'system',
      content: SYSTEM_PROMPT
    }
  ];

  // Add problem context
  messages.push({
    role: 'user',
    content: `Problem: ${problemText}${normalizedLatex !== problemText ? `\nLaTeX: ${normalizedLatex}` : ''}\nCategory: ${category}\n\nStart the conversation with a Socratic question to help the student discover the solution.`
  });

  // Add conversation history
  conversationHistory.forEach(step => {
    if (step.tutor_prompt) {
      messages.push({
        role: 'assistant',
        content: step.tutor_prompt
      });
    }
    if (step.student_response) {
      messages.push({
        role: 'user',
        content: step.student_response
      });
    }
  });

  // Add current student response (if any)
  if (studentResponse) {
    messages.push({
      role: 'user',
      content: studentResponse
    });
  }

  // Add hint instruction if needed
  if (shouldProvideHint) {
    messages.push({
      role: 'system',
      content: 'The student has been stuck for 2+ turns. Provide a concrete hint while still guiding them to discover the answer themselves. Make it encouraging.'
    });
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages,
      max_tokens: 200,
      temperature: 0.7
    });

    const tutorMessage = response.choices[0]?.message?.content?.trim() || 'Let\'s think about this step by step.';

    logger.debug(`Generated tutor response: ${tutorMessage.substring(0, 100)}...`);

    return {
      message: tutorMessage,
      hintProvided: shouldProvideHint,
      tokensUsed: response.usage?.total_tokens || 0
    };
  } catch (error) {
    logger.error('Error generating tutor response:', error);
    throw new OpenAIError('Failed to generate tutor response', error);
  }
}

/**
 * Process student response and determine next action
 * @param {Object} params - Processing parameters
 * @param {string} params.studentResponse - Student's response
 * @param {Object} params.problem - Problem object
 * @param {Array} params.steps - Current conversation steps
 * @returns {Promise<Object>} Response with tutor message and metadata
 */
export async function processStudentResponse({ studentResponse, problem, steps = [] }) {
  // Analyze progress
  const progressAnalysis = analyzeProgress(studentResponse, steps, problem.raw_input);
  
  // Count stuck turns
  const stuckTurns = countStuckTurns(steps);
  
  // Determine if hint should be provided
  const shouldProvideHint = stuckTurns >= 2 && !progressAnalysis.madeProgress;

  // Update progress analysis with stuck count
  progressAnalysis.stuckTurns = stuckTurns;
  progressAnalysis.shouldProvideHint = shouldProvideHint;

  // Generate tutor response
  const tutorResponse = await generateTutorResponse({
    problemText: problem.raw_input,
    normalizedLatex: problem.normalized_latex,
    category: problem.category,
    studentResponse,
    conversationHistory: steps,
    shouldProvideHint
  });

  // Build step object
  const step = {
    tutor_prompt: tutorResponse.message,
    student_response: studentResponse,
    hint_used: tutorResponse.hintProvided,
    progress_made: progressAnalysis.madeProgress,
    stuck_turns: stuckTurns,
    timestamp: new Date().toISOString()
  };

  return {
    step,
    progressAnalysis,
    tutorMessage: tutorResponse.message
  };
}

/**
 * Generate initial tutor prompt for a new problem
 * @param {Object} problem - Problem object
 * @returns {Promise<string>} Initial tutor message
 */
export async function generateInitialPrompt(problem) {
  const response = await generateTutorResponse({
    problemText: problem.raw_input,
    normalizedLatex: problem.normalized_latex,
    category: problem.category,
    studentResponse: null, // No response yet
    conversationHistory: [],
    shouldProvideHint: false
  });

  return response.message;
}

