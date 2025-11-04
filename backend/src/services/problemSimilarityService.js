/**
 * Problem Similarity Service
 * Hybrid approach: Embedding-based similarity + LLM generation
 */

import '../config/env.js';
import { openai } from './openai.js';
import { getAllSessions } from './dashboardService.js';
import { createLogger } from '../utils/logger.js';
import { OpenAIError } from '../utils/errorHandler.js';

const logger = createLogger();

/**
 * Generate embedding for a problem using OpenAI
 * @param {string} problemText - Problem text to embed
 * @returns {Promise<number[]>} Embedding vector
 */
export async function generateProblemEmbedding(problemText) {
  if (!problemText || problemText.trim().length === 0) {
    throw new Error('Problem text cannot be empty');
  }

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: problemText.trim()
    });

    const embedding = response.data[0].embedding;
    logger.debug(`Generated embedding for problem: ${problemText.substring(0, 50)}...`);
    
    return embedding;
  } catch (error) {
    logger.error('Error generating problem embedding:', error);
    throw new OpenAIError('Failed to generate problem embedding', error);
  }
}

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vecA - First vector
 * @param {number[]} vecB - Second vector
 * @returns {number} Cosine similarity (0-1)
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Find similar problems using embedding-based similarity
 * @param {Object} originalProblem - Original problem object with text
 * @param {number} limit - Maximum number of similar problems to return
 * @returns {Promise<Array>} Array of similar problems with similarity scores
 */
export async function findSimilarProblems(originalProblem, limit = 2) {
  try {
    // Generate embedding for original problem
    const originalText = originalProblem.raw_input || originalProblem.normalized_latex || originalProblem.problem_text || '';
    if (!originalText) {
      logger.warn('No problem text found for similarity search');
      return [];
    }

    const originalEmbedding = await generateProblemEmbedding(originalText);

    // Get all sessions and extract problems
    const sessions = await getAllSessions();
    const allProblems = [];

    sessions.forEach(session => {
      const problems = session.problems || [];
      problems.forEach(problem => {
        // Only consider problems that have been completed or have assessment
        if (problem.completed || problem.learning_assessment) {
          const problemText = problem.raw_input || problem.normalized_latex || '';
          if (problemText && problemText !== originalText) {
            allProblems.push({
              problem,
              problemText,
              sessionCode: session.session_code,
              embedding: problem.embedding || null // May not exist yet
            });
          }
        }
      });
    });

    if (allProblems.length === 0) {
      logger.debug('No problems found in database for similarity search');
      return [];
    }

    // Generate embeddings for problems that don't have them yet
    const problemsWithEmbeddings = [];
    for (const item of allProblems) {
      let embedding = item.embedding;
      
      if (!embedding) {
        try {
          embedding = await generateProblemEmbedding(item.problemText);
          // Note: We don't save embeddings back to DB here (lazy generation)
          // Could be optimized to save them, but keeping it simple for MVP
        } catch (error) {
          logger.warn(`Failed to generate embedding for problem: ${error.message}`);
          continue; // Skip this problem
        }
      }

      problemsWithEmbeddings.push({
        ...item,
        embedding
      });
    }

    // Calculate similarities
    const similarities = problemsWithEmbeddings.map(item => {
      const similarity = cosineSimilarity(originalEmbedding, item.embedding);
      return {
        problemText: item.problemText,
        similarity,
        problemId: item.problem.problem_id,
        sessionCode: item.sessionCode,
        category: item.problem.category,
        difficulty: item.problem.difficulty
      };
    });

    // Sort by similarity (highest first) and return top N
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topSimilar = similarities.slice(0, limit);

    logger.info(`Found ${topSimilar.length} similar problems (top similarity: ${topSimilar[0]?.similarity?.toFixed(3) || 0})`);
    
    return topSimilar;
  } catch (error) {
    logger.error('Error finding similar problems:', error);
    return []; // Return empty array on error
  }
}

/**
 * Find similar problems with timeout support
 * Processes problems incrementally and returns best results available within timeout
 * Prioritizes problems with existing embeddings for faster results
 * @param {Object} originalProblem - Original problem object with text
 * @param {number} limit - Maximum number of similar problems to return
 * @param {number} timeoutMs - Maximum time to spend searching (milliseconds)
 * @returns {Promise<Array>} Array of similar problems with similarity scores
 */
export async function findSimilarProblemsWithTimeout(originalProblem, limit = 2, timeoutMs = 5000) {
  const startTime = Date.now();
  
  try {
    // Generate embedding for original problem
    const originalText = originalProblem.raw_input || originalProblem.normalized_latex || originalProblem.problem_text || '';
    if (!originalText) {
      logger.warn('No problem text found for similarity search');
      return [];
    }

    const originalEmbedding = await generateProblemEmbedding(originalText);
    
    // Check timeout
    if (Date.now() - startTime >= timeoutMs) {
      logger.warn('Timeout reached after generating original embedding');
      return [];
    }

    // Get all sessions and extract problems
    const sessions = await getAllSessions();
    const allProblems = [];

    sessions.forEach(session => {
      const problems = session.problems || [];
      problems.forEach(problem => {
        // Only consider problems that have been completed or have assessment
        if (problem.completed || problem.learning_assessment) {
          const problemText = problem.raw_input || problem.normalized_latex || '';
          if (problemText && problemText !== originalText) {
            allProblems.push({
              problem,
              problemText,
              sessionCode: session.session_code,
              embedding: problem.embedding || null // May not exist yet
            });
          }
        }
      });
    });

    if (allProblems.length === 0) {
      logger.debug('No problems found in database for similarity search');
      return [];
    }

    // Separate problems with and without embeddings (prioritize existing embeddings)
    const problemsWithEmbeddings = [];
    const problemsWithoutEmbeddings = [];

    for (const item of allProblems) {
      if (item.embedding) {
        problemsWithEmbeddings.push(item);
      } else {
        problemsWithoutEmbeddings.push(item);
      }
    }

    // First, process problems that already have embeddings (faster)
    const similarities = [];
    
    for (const item of problemsWithEmbeddings) {
      // Check timeout periodically
      if (Date.now() - startTime >= timeoutMs) {
        logger.info('Timeout reached while processing existing embeddings');
        break;
      }
      
      try {
        const similarity = cosineSimilarity(originalEmbedding, item.embedding);
        similarities.push({
          problemText: item.problemText,
          similarity,
          problemId: item.problem.problem_id,
          sessionCode: item.sessionCode,
          category: item.problem.category,
          difficulty: item.problem.difficulty
        });
      } catch (error) {
        logger.warn(`Error calculating similarity: ${error.message}`);
      }
    }

    // Sort what we have so far
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    // If we already have enough results, return early
    if (similarities.length >= limit) {
      logger.info(`Found ${limit} similar problems from existing embeddings (early return)`);
      return similarities.slice(0, limit);
    }

    // If we have time, process problems without embeddings (limit to avoid timeout)
    const maxNewEmbeddings = Math.min(10, problemsWithoutEmbeddings.length); // Limit to 10 to avoid timeout
    for (let i = 0; i < maxNewEmbeddings && similarities.length < limit * 2; i++) {
      // Check timeout before each embedding generation
      if (Date.now() - startTime >= timeoutMs) {
        logger.info('Timeout reached while generating new embeddings');
        break;
      }
      
      const item = problemsWithoutEmbeddings[i];
      try {
        const embedding = await generateProblemEmbedding(item.problemText);
        const similarity = cosineSimilarity(originalEmbedding, embedding);
        similarities.push({
          problemText: item.problemText,
          similarity,
          problemId: item.problem.problem_id,
          sessionCode: item.sessionCode,
          category: item.problem.category,
          difficulty: item.problem.difficulty
        });
      } catch (error) {
        logger.warn(`Failed to generate embedding for problem: ${error.message}`);
        continue;
      }
    }

    // Sort again and return top N
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topSimilar = similarities.slice(0, limit);

    logger.info(`Found ${topSimilar.length} similar problems within timeout (top similarity: ${topSimilar[0]?.similarity?.toFixed(3) || 0})`);
    
    return topSimilar;
  } catch (error) {
    logger.error('Error finding similar problems with timeout:', error);
    return []; // Return empty array on error
  }
}

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

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
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
 * Get similar problem options (hybrid approach) with 5-second timeout
 * Combines embedding-based similarity with LLM generation
 * Returns the best results available within 5 seconds
 * @param {Object} originalProblem - Original problem object
 * @returns {Promise<Array>} Array of up to 3 similar problem options
 */
export async function getSimilarProblemOptions(originalProblem) {
  const TIMEOUT_MS = 5000; // 5 seconds
  const startTime = Date.now();
  const results = [];

  try {
    // Start both operations in parallel to maximize efficiency
    const dbPromise = findSimilarProblemsWithTimeout(originalProblem, 2, TIMEOUT_MS);
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

    // Race both operations against the timeout
    // Use Promise.allSettled to get whatever completes first
    const [dbSettled, llmSettled] = await Promise.allSettled([
      withTimeout(dbPromise, TIMEOUT_MS),
      withTimeout(llmPromise, TIMEOUT_MS)
    ]);

    // Process DB results
    if (dbSettled.status === 'fulfilled' && Array.isArray(dbSettled.value) && dbSettled.value.length > 0) {
      results.push(...dbSettled.value.map(p => ({
        problemText: p.problemText,
        similarity: p.similarity,
        source: 'database',
        problemId: p.problemId,
        sessionCode: p.sessionCode
      })));
    }

    // Process LLM results
    if (llmSettled.status === 'fulfilled' && Array.isArray(llmSettled.value) && llmSettled.value.length > 0) {
      const llmCount = Math.max(1, 3 - results.length);
      const llmResults = llmSettled.value.slice(0, llmCount);
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

