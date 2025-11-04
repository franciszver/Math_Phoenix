/**
 * Learning Assessment Service
 * Handles MC quiz generation, transfer problems, and learning confidence calculation
 */

import '../config/env.js';
import { openai } from './openai.js';
import { createLogger } from '../utils/logger.js';
import { OpenAIError } from '../utils/errorHandler.js';

const logger = createLogger();

/**
 * Extract the problem-solving approach from conversation
 * @param {Object} problem - Problem object
 * @param {Array} conversationSteps - Conversation steps
 * @returns {Promise<string>} Extracted approach description
 */
export async function extractApproachFromConversation(problem, conversationSteps) {
  try {
    const conversationSummary = conversationSteps
      .map(s => `Tutor: ${s.tutor_prompt}\nStudent: ${s.student_response}`)
      .join('\n\n');

    const prompt = `Analyze this math tutoring conversation and identify the specific problem-solving approach/method that was used.

Problem: ${problem.raw_input}
${problem.normalized_latex !== problem.raw_input ? `LaTeX: ${problem.normalized_latex}` : ''}
Category: ${problem.category}

Conversation:
${conversationSummary}

Identify the core approach used (e.g., "solving linear equations by isolating variables", "using area formula for rectangles", "solving by substitution"). 

Respond with ONLY a brief description of the approach (1-2 sentences max).`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at identifying mathematical problem-solving approaches from tutoring conversations. Respond concisely.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 100,
      temperature: 0.3
    });

    const approach = response.choices[0]?.message?.content?.trim() || 'Problem-solving approach';
    logger.debug(`Extracted approach: ${approach.substring(0, 50)}...`);
    
    return approach;
  } catch (error) {
    logger.error('Error extracting approach:', error);
    // Fallback based on category
    const categoryApproaches = {
      arithmetic: 'Basic arithmetic operations',
      algebra: 'Solving algebraic equations',
      geometry: 'Geometric calculations',
      word: 'Word problem solving',
      'multi-step': 'Multi-step problem solving'
    };
    return categoryApproaches[problem.category] || 'Mathematical problem solving';
  }
}

/**
 * Generate multiple choice questions about the approach
 * @param {Object} problem - Problem object
 * @param {string} approach - Extracted approach description
 * @param {Array} conversationSteps - Conversation steps
 * @returns {Promise<Array>} Array of MC question objects
 */
export async function generateMCQuestions(problem, approach, conversationSteps) {
  try {
    // Extract key steps from conversation
    const keySteps = conversationSteps
      .filter(s => s.progress_made)
      .map(s => s.student_response)
      .slice(-3)
      .join(', ');

    const prompt = `Generate EXACTLY 2-3 multiple choice questions (prefer 3, minimum 2) that test understanding of the problem-solving approach used. Make them age-appropriate for K-12 students.

Problem: ${problem.raw_input}
Approach used: ${approach}
Key steps taken: ${keySteps || 'Student worked through the problem step by step'}

IMPORTANT: Generate EXACTLY 2-3 questions (minimum 2). Test different aspects:
1. Which method/strategy was used ("How did we solve this problem?")
2. Key steps in the approach ("What did we do first?" or "What did we do next?")
3. Why the approach works ("Why did we use this method?")

For each question, provide:
- The question text (simple, clear language)
- 4 answer options (one correct, three plausible distractors)
- The correct answer index (0-3)

Respond with ONLY a JSON array with 2-3 questions in this exact format:
[
  {
    "question": "How did we solve this problem?",
    "options": ["Added numbers", "Isolated the variable", "Multiplied everything", "Guessed"],
    "correct_answer_index": 1
  },
  {
    "question": "What did we do first?",
    "options": ["Subtracted 3", "Multiplied by 5", "Divided by 2", "Added 10"],
    "correct_answer_index": 0
  }
]`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at creating educational multiple choice questions. Respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.7
    });

    const content = response.choices[0]?.message?.content?.trim() || '[]';
    const cleanedContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const questions = JSON.parse(cleanedContent);

    // Validate and ensure we have at least 2 questions (prefer 3)
    let validatedQuestions = questions
      .filter(q => q.question && q.options && q.options.length === 4 && 
                    typeof q.correct_answer_index === 'number' && 
                    q.correct_answer_index >= 0 && q.correct_answer_index < 4)
      .slice(0, 3) // Take up to 3
      .map((q, index) => ({
        question_id: `mcq-${problem.problem_id || 'default'}-${index}`,
        question: q.question,
        options: q.options,
        correct_answer_index: q.correct_answer_index,
        student_answer_index: null,
        correct: null
      }));

    // If we got less than 2 questions, generate additional ones
    if (validatedQuestions.length < 2) {
      logger.warn(`Only ${validatedQuestions.length} MC questions generated, generating additional`);
      
      // Generate a simple follow-up question
      const additionalQuestion = {
        question_id: `mcq-${problem.problem_id || 'default'}-${validatedQuestions.length}`,
        question: 'What did we do to solve this problem?',
        options: [
          'We worked through it step by step',
          'We guessed the answer',
          'We skipped the problem',
          'We asked for help'
        ],
        correct_answer_index: 0,
        student_answer_index: null,
        correct: null
      };
      
      validatedQuestions.push(additionalQuestion);
    }

    logger.debug(`Generated ${validatedQuestions.length} MC questions`);
    return validatedQuestions;
  } catch (error) {
    logger.error('Error generating MC questions:', error);
    // Return fallback questions
    return [
      {
        question_id: 'q1',
        question: 'How did we solve this problem?',
        options: ['By working through it step by step', 'By guessing', 'By asking for help', 'By using a calculator'],
        correct_answer_index: 0,
        student_answer_index: null,
        correct: null
      }
    ];
  }
}

/**
 * Evaluate MC answer
 * @param {Object} question - MC question object
 * @param {number} selectedIndex - Selected answer index
 * @returns {Object} Updated question with student answer and correctness
 */
export function evaluateMCAnswer(question, selectedIndex) {
  const correct = selectedIndex === question.correct_answer_index;
  return {
    ...question,
    student_answer_index: selectedIndex,
    correct
  };
}

/**
 * Generate transfer problem (similar problem with same approach)
 * @param {Object} problem - Original problem
 * @param {string} approach - Approach description
 * @returns {Promise<Object>} Transfer problem object
 */
export async function generateTransferProblem(problem, approach) {
  try {
    const prompt = `Generate a similar math problem that uses the EXACT SAME problem-solving approach but with different numbers and/or context.

Original problem: ${problem.raw_input}
Category: ${problem.category}
Approach: ${approach}

Generate a new problem that:
- Uses the same approach/method
- Has different numbers or context
- Is appropriate for K-12 students
- Is similar in difficulty level

Respond with ONLY the problem text, nothing else.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at creating educational math problems. Generate similar problems that use the same approaches.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    const transferProblemText = response.choices[0]?.message?.content?.trim() || '';
    
    logger.debug(`Generated transfer problem: ${transferProblemText.substring(0, 50)}...`);
    
    return {
      problem_text: transferProblemText,
      approach: approach,
      original_problem_id: problem.problem_id
    };
  } catch (error) {
    logger.error('Error generating transfer problem:', error);
    return null;
  }
}

/**
 * Calculate learning confidence score
 * @param {number} mcScore - MC quiz score (0-1)
 * @param {boolean|null} transferSuccess - Transfer problem success (true/false/null)
 * @returns {number} Learning confidence score (0-1)
 */
export function calculateLearningConfidence(mcScore, transferSuccess) {
  if (transferSuccess === null || transferSuccess === undefined) {
    // Only MC available (transfer skipped or not offered)
    return mcScore;
  }
  
  // Weighted: MC 60%, Transfer 40%
  return (mcScore * 0.6) + (transferSuccess ? 0.4 : 0);
}

/**
 * Get adaptive recommendation based on confidence
 * @param {number} confidence - Learning confidence score
 * @param {Object} problem - Problem object
 * @returns {Object} Recommendation with action and message
 */
export function getAdaptiveRecommendation(confidence, problem) {
  if (confidence >= 0.8) {
    return {
      action: 'continue',
      message: "Excellent! You've really mastered this approach! Ready to try another problem?",
      suggestPractice: false
    };
  } else if (confidence >= 0.5) {
    return {
      action: 'optional_practice',
      message: "Good progress! A bit more practice will make this solid. Want to try another similar problem?",
      suggestPractice: true
    };
  } else {
    return {
      action: 'recommend_practice',
      message: "Let's practice this approach with one more problem to strengthen your understanding!",
      suggestPractice: true
    };
  }
}

