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

IMPORTANT - AVOID QUESTIONS THAT ELICIT MULTIPLE NUMBERS:
- NEVER ask questions like "What numbers are we adding?" or "Which numbers do we use?" 
- These questions cause students to respond with multiple numbers (e.g., "5 and 3"), which can be mistaken for a new problem submission
- Instead, ask questions that require:
  * Single-number responses: "What is the first number?" or "What number do we start with?"
  * Non-numeric responses: "What operation should we use?" or "What step comes next?" or "How do we solve this?"
  * Method-based answers: "What strategy should we try?" or "What should we do first?"
- If you need to reference specific numbers, frame it as: "Can you tell me the first number?" or "What number appears in the problem first?"

TONE:
- Warm and encouraging
- Patient with mistakes
- Celebrate progress, even small steps
- Use age-appropriate language for K-12 students`;

/**
 * Detect positive feedback/validation in tutor's message
 * This is the PRIMARY signal for progress - tutor validates when student is correct
 * @param {string} tutorMessage - Tutor's response message
 * @returns {boolean} True if tutor is providing positive validation
 */
function detectTutorValidation(tutorMessage) {
  if (!tutorMessage) return false;
  
  const message = tutorMessage.toLowerCase().trim();
  
  // Strong positive validation indicators
  const strongValidationPatterns = [
    /^(that'?s|that is)\s+(correct|right|exactly|perfect)/i,
    /^(correct|right|exactly|perfect|excellent|great job|well done|good work)/i,
    /^(you'?re|you are)\s+(correct|right)/i,
    /(that'?s|that is)\s+(correct|right|exactly|perfect)/i,
    /^\s*(yes|absolutely|precisely|spot on|perfect)/i,
    /(good|great|excellent|perfect|right|correct)\s+(answer|thinking|work|job)/i,
    /(you'?ve got it|you got it|that'?s it|exactly right)/i
  ];
  
  // Avoid false positives - check if tutor is correcting or redirecting
  const correctionPatterns = [
    /but/i,
    /however/i,
    /not quite/i,
    /almost/i,
    /close/i,
    /think again/i,
    /try again/i,
    /let'?s try/i,
    /what about/i
  ];
  
  const hasCorrection = correctionPatterns.some(pattern => pattern.test(message));
  
  // If there's a correction, definitely not validation
  if (hasCorrection) {
    return false;
  }
  
  // Check for strong validation patterns
  const hasStrongValidation = strongValidationPatterns.some(pattern => pattern.test(message));
  
  // Strong validation = definite progress (and no correction)
  if (hasStrongValidation) {
    return true;
  }
  
  // Check for encouraging phrases that might indicate validation
  // These are weaker signals, so we only use them if there's no correction
  const encouragingPatterns = [
    /^(good|great|nice|well done)\s+(answer|thinking|work|job)/i,
    /^(good|great|nice|well done)!/i
  ];
  
  const hasEncouraging = encouragingPatterns.some(pattern => pattern.test(message));
  
  // Only count encouraging phrases if they're clearly validating (not just general encouragement)
  return hasEncouraging;
}

/**
 * Analyze student response to determine progress
 * This is now a FALLBACK signal when tutor feedback is ambiguous
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
  // Allow single-digit numeric responses (like "1", "5") to count as progress
  // since these are often valid answers to questions like "what's the first number?"
  const isNumericAnswer = /^\d+$/.test(response); // Pure numeric response (single or multiple digits)
  const hasMinimumLength = response.length > 3 || isNumericAnswer;
  const madeProgress = progressScore > stuckScore && hasMinimumLength;

  logger.debug(`[PROGRESS] analyzeProgress result:`, {
    studentResponse: studentResponse.substring(0, 50),
    progressScore,
    stuckScore,
    responseLength: response.length,
    madeProgress
  });

  return {
    madeProgress,
    progressScore,
    stuckScore,
    responseLength: response.length
  };
}

/**
 * Detect if student response indicates solution completion
 * Uses LLM to analyze if response is a final answer vs intermediate step
 * @param {string} studentResponse - Student's response
 * @param {Object} problem - Problem object
 * @param {Array} steps - Conversation steps
 * @returns {Promise<Object>} Detection result with solution_completed flag and answer verification
 */
export async function detectSolutionCompletion(studentResponse, problem, steps = []) {
  try {
    const prompt = `Analyze this student's response to determine if they have provided a FINAL ANSWER to the problem, or if this is just an intermediate step.

Problem: ${problem.raw_input}
${problem.normalized_latex !== problem.raw_input ? `LaTeX: ${problem.normalized_latex}` : ''}

Student's response: "${studentResponse}"

Previous conversation context:
${steps.slice(-3).map(s => `Tutor: ${s.tutor_prompt}\nStudent: ${s.student_response}`).join('\n\n')}

Respond with ONLY a JSON object in this exact format:
{
  "solution_completed": true or false,
  "is_correct": true or false (if solution_completed is true),
  "reasoning": "brief explanation"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing student responses to determine if they have completed a math problem. Respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 150,
      temperature: 0.3
    });

    const content = response.choices[0]?.message?.content?.trim() || '{}';
    
    // Clean up any markdown code blocks
    const cleanedContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    const result = JSON.parse(cleanedContent);

    logger.debug(`Solution completion detection: ${result.solution_completed}, correct: ${result.is_correct}`);

    return {
      solution_completed: result.solution_completed || false,
      is_correct: result.is_correct || false,
      reasoning: result.reasoning || ''
    };
  } catch (error) {
    logger.error('Error detecting solution completion:', error);
    // Fallback: use pattern matching
    const response = studentResponse.toLowerCase().trim();
    const completionPatterns = [
      /^(the answer is|it's|i got|i think it's|the solution is)\s*[:\-]?\s*\d+/i,
      /^\d+$/,
      /^x\s*=\s*\d+/i,
      /^answer:\s*\d+/i
    ];

    const looksLikeCompletion = completionPatterns.some(pattern => pattern.test(response));

    return {
      solution_completed: looksLikeCompletion,
      is_correct: false, // Unknown, would need verification
      reasoning: 'Pattern matching fallback'
    };
  }
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
    shouldProvideHint = false,
    correctionContext = null
  } = context;

  // Build conversation history for context
  const messages = [
    {
      role: 'system',
      content: SYSTEM_PROMPT
    }
  ];

  // Add correction context if provided (must be before problem context)
  if (correctionContext && correctionContext.originalText && correctionContext.correctedText) {
    messages.push({
      role: 'system',
      content: `IMPORTANT: The problem text was incorrectly read from the image. The original text was "${correctionContext.originalText}" but the correct text from the image is "${correctionContext.correctedText}". Please acknowledge this correction naturally and seamlessly in your response, then continue guiding the student with the correct problem. Make it encouraging and don't make the student feel bad about the error.`
    });
  }

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
  // Step 1: Analyze student response as fallback signal
  const progressAnalysis = analyzeProgress(studentResponse, steps, problem.raw_input);
  
  // Count stuck turns from previous steps (before current response)
  const stuckTurns = countStuckTurns(steps);
  
  // Determine preliminary hint logic based on student response analysis
  // This is used to generate the tutor response, but will be re-evaluated after we check tutor validation
  const preliminaryShouldProvideHint = stuckTurns >= 2 && !progressAnalysis.madeProgress;

  // Update progress analysis with stuck count
  progressAnalysis.stuckTurns = stuckTurns;

  // Generate tutor response using preliminary hint logic
  const tutorResponse = await generateTutorResponse({
    problemText: problem.raw_input,
    normalizedLatex: problem.normalized_latex,
    category: problem.category,
    studentResponse,
    conversationHistory: steps,
    shouldProvideHint: preliminaryShouldProvideHint
  });

  // Step 2: PRIMARY SIGNAL - Check if tutor is providing positive validation
  const tutorValidates = detectTutorValidation(tutorResponse.message);
  
  // Step 3: Determine final progress_made
  // Use tutor validation as primary signal, fallback to student response analysis
  // If tutor validates, it's definitely progress (tutor knows the answer is correct)
  // If tutor doesn't validate but student response shows progress indicators, use that as fallback
  const finalProgressMade = tutorValidates || progressAnalysis.madeProgress;
  
  // Final hint logic: if tutor validates OR student shows progress, don't provide hint
  // Only provide hint if student has been stuck for 2+ turns AND no progress detected
  // Note: If tutor validates, we know progress was made, so hint wouldn't be needed anyway
  const finalShouldProvideHint = stuckTurns >= 2 && !finalProgressMade;
  
  // Log for debugging
  if (tutorValidates) {
    logger.debug(`[PROGRESS] Tutor validation detected: "${tutorResponse.message.substring(0, 50)}..."`);
  } else if (progressAnalysis.madeProgress) {
    logger.debug(`[PROGRESS] Fallback: Student response shows progress indicators`);
  }

  // Build step object with final progress determination
  const step = {
    tutor_prompt: tutorResponse.message,
    student_response: studentResponse,
    hint_used: tutorResponse.hintProvided && finalShouldProvideHint, // Use final hint logic
    progress_made: finalProgressMade, // Use tutor validation as primary
    stuck_turns: stuckTurns,
    timestamp: new Date().toISOString()
  };

  // Update progress analysis with final hint decision
  progressAnalysis.shouldProvideHint = finalShouldProvideHint;
  
  logger.info(`[STEP] Created step:`, {
    hint_used: step.hint_used,
    progress_made: step.progress_made,
    tutor_validates: tutorValidates,
    student_response_progress: progressAnalysis.madeProgress,
    stuck_turns: step.stuck_turns,
    shouldProvideHint: finalShouldProvideHint,
    preliminaryShouldProvideHint: preliminaryShouldProvideHint
  });

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

