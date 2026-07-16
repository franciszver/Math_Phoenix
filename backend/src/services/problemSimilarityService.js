/**
 * Problem Similarity Service
 * LLM-based generation of similar problems
 */

import '../config/env.js';
import { createChatCompletion, TEXT_MODEL } from './openai.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

const TIMEOUT_MS = Number(process.env.SIMILARITY_TIMEOUT_MS) || 30000;

/**
 * Generate similar problems using LLM
 * @param {Object} originalProblem - Original problem object
 * @param {number} count - Number of problems to generate
 * @returns {Promise<Array>} Array of generated similar problems
 */
export async function generateSimilarProblems(originalProblem, count = 2) {
  const originalText = originalProblem.raw_input || originalProblem.normalized_latex || originalProblem.problem_text || '';
  
  if (!originalText) {
    logger.warn('No problem text found for LLM generation');
    return [];
  }

  try {
    const prompt = `Generate ${count} similar math problems to this one. Each problem should:
- Use the same problem-solving approach/method
- Have similar structure and difficulty level
- Use different numbers or scenarios
- Be solvable and well-formed

Original problem: "${originalText}"

Return ONLY the problems, one per line, numbered:
1. [first similar problem]
2. [second similar problem]
${count > 2 ? '...' : ''}`;

    const response = await createChatCompletion({
      model: TEXT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a math problem generator. Generate similar problems that test the same concepts but with different numbers or scenarios.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 800,
      temperature: 0.7
    });

    const responseText = response.choices[0]?.message?.content?.trim() || '';
    
    // Parse numbered list
    const problemLines = responseText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && /^\d+[\.\)]\s+/.test(line));

    const generatedProblems = problemLines
      .slice(0, count)
      .map(line => {
        const problemText = line.replace(/^\d+[\.\)]\s*/, '').trim();
        return {
          problemText,
          similarity: null, // LLM-generated, no similarity score
          generated: true
        };
      })
      .filter(p => p.problemText.length > 0);

    logger.info(`Generated ${generatedProblems.length} similar problems via LLM`);
    
    return generatedProblems;
  } catch (error) {
    logger.error('Error generating similar problems via LLM:', error);
    return []; // Return empty array on error
  }
}

/**
 * Create a promise that rejects after a timeout
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<never>}
 */
function timeoutPromise(ms) {
  let timer;
  const promise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timeout')), ms);
  });
  // Prevent the timer from keeping the process alive / leaking once the race settles.
  promise.cancel = () => clearTimeout(timer);
  return promise;
}

/**
 * Get similar problem options via LLM generation with a 5-second timeout
 * Returns the best results available within 5 seconds
 * @param {Object} originalProblem - Original problem object
 * @returns {Promise<Array>} Array of up to 3 similar problem options
 */
export async function getSimilarProblemOptions(originalProblem) {
  const startTime = Date.now();
  const timeout = timeoutPromise(TIMEOUT_MS);

  let llmResult;
  try {
    llmResult = await Promise.race([generateSimilarProblems(originalProblem, 3), timeout]);
  } catch (error) {
    // Timeout or unexpected error - return empty array so we always return something
    if (error.message === 'Timeout') {
      logger.debug('Operation timed out');
    } else {
      logger.error('Error getting similar problem options:', error);
    }
    llmResult = [];
  } finally {
    timeout.cancel();
  }

  const result = Array.isArray(llmResult)
    ? llmResult.slice(0, 3).map(p => ({
        problemText: p.problemText,
        similarity: null,
        source: 'generated',
        generated: true
      }))
    : [];

  const totalTime = Date.now() - startTime;
  logger.info(`Returning ${result.length} similar problem options (took ${totalTime}ms, timeout: ${TIMEOUT_MS}ms)`);

  return result;
}

