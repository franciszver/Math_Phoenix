/**
 * Problem Similarity Service
 * LLM-based generation of similar problems
 */

import '../config/env.js';
import { createChatCompletion, TEXT_MODEL } from './openai.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

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
      max_tokens: 500,
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
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Timeout')), ms);
  });
}

/**
 * Get similar problem options via LLM generation with a 5-second timeout
 * Returns the best results available within 5 seconds
 * @param {Object} originalProblem - Original problem object
 * @returns {Promise<Array>} Array of up to 3 similar problem options
 */
export async function getSimilarProblemOptions(originalProblem) {
  const TIMEOUT_MS = 5000; // 5 seconds
  const startTime = Date.now();
  const results = [];

  try {
    const llmPromise = generateSimilarProblems(originalProblem, 3);

    // Helper to wrap promises with timeout handling
    // Returns empty array on timeout or error to ensure we always return something
    const withTimeout = async (promise, timeoutMs) => {
      try {
        return await Promise.race([
          promise,
          timeoutPromise(timeoutMs).then(() => {
            throw new Error('Timeout');
          })
        ]);
      } catch (error) {
        // Return empty array for both timeout and other errors
        // This ensures we can continue processing other results
        if (error.message === 'Timeout') {
          logger.debug('Operation timed out');
        } else {
          logger.warn('Operation failed:', error.message);
        }
        return []; // Return empty array on timeout or error
      }
    };

    // Race the LLM generation against the timeout
    const llmResult = await withTimeout(llmPromise, TIMEOUT_MS);

    // Process LLM results
    if (Array.isArray(llmResult) && llmResult.length > 0) {
      const llmResults = llmResult.slice(0, 3);
      results.push(...llmResults.map(p => ({
        problemText: p.problemText,
        similarity: null,
        source: 'generated',
        generated: true
      })));
    }

    // If we still don't have results and have time, try one more quick LLM generation
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(500, TIMEOUT_MS - elapsed);
    
    if (results.length === 0 && remainingTime > 500) {
      try {
        const fallback = await Promise.race([
          generateSimilarProblems(originalProblem, 3),
          timeoutPromise(remainingTime)
        ]);
        
        if (Array.isArray(fallback) && fallback.length > 0) {
          results.push(...fallback.map(p => ({
            problemText: p.problemText,
            similarity: null,
            source: 'generated',
            generated: true
          })));
        }
      } catch (error) {
        if (error.message !== 'Timeout') {
          logger.warn('Fallback LLM generation failed:', error.message);
        }
      }
    }

    // Return top 3 (or whatever we have)
    const result = results.slice(0, 3);
    const totalTime = Date.now() - startTime;
    
    logger.info(`Returning ${result.length} similar problem options (took ${totalTime}ms, timeout: ${TIMEOUT_MS}ms)`);
    
    return result;
  } catch (error) {
    logger.error('Error getting similar problem options:', error);
    
    // Final fallback: try quick LLM generation if we have time
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(500, TIMEOUT_MS - elapsed);
    
    if (results.length === 0 && remainingTime > 500) {
      try {
        const fallback = await Promise.race([
          generateSimilarProblems(originalProblem, 3),
          timeoutPromise(remainingTime)
        ]);
        
        return Array.isArray(fallback) && fallback.length > 0
          ? fallback.map(p => ({
              problemText: p.problemText,
              similarity: null,
              source: 'generated',
              generated: true
            }))
          : [];
      } catch (fallbackError) {
        logger.error('Final fallback LLM generation also failed:', fallbackError);
        return [];
      }
    }
    
    return results.slice(0, 3);
  }
}

