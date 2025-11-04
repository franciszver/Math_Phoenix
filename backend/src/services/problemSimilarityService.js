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
 * Get similar problem options (hybrid approach)
 * Combines embedding-based similarity with LLM generation
 * @param {Object} originalProblem - Original problem object
 * @returns {Promise<Array>} Array of 3 similar problem options
 */
export async function getSimilarProblemOptions(originalProblem) {
  try {
    // Try to find similar problems from database using embeddings
    const similarFromDB = await findSimilarProblems(originalProblem, 2);
    
    // Generate problems via LLM to ensure we have enough options
    const llmCount = Math.max(1, 3 - similarFromDB.length);
    const generatedProblems = await generateSimilarProblems(originalProblem, llmCount);
    
    // Combine results
    const allOptions = [
      ...similarFromDB.map(p => ({
        problemText: p.problemText,
        similarity: p.similarity,
        source: 'database',
        problemId: p.problemId,
        sessionCode: p.sessionCode
      })),
      ...generatedProblems.map(p => ({
        problemText: p.problemText,
        similarity: null,
        source: 'generated',
        generated: true
      }))
    ];

    // Return top 3
    const result = allOptions.slice(0, 3);
    
    logger.info(`Returning ${result.length} similar problem options (${similarFromDB.length} from DB, ${generatedProblems.length} generated)`);
    
    return result;
  } catch (error) {
    logger.error('Error getting similar problem options:', error);
    // Fallback: try LLM generation only
    try {
      const fallback = await generateSimilarProblems(originalProblem, 3);
      return fallback.map(p => ({
        problemText: p.problemText,
        similarity: null,
        source: 'generated',
        generated: true
      }));
    } catch (fallbackError) {
      logger.error('Fallback LLM generation also failed:', fallbackError);
      return [];
    }
  }
}

