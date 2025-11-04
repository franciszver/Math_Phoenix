/**
 * Dashboard Service
 * Handles DynamoDB operations for dashboard statistics
 */

import '../config/env.js';
import { dynamoDocClient } from './aws.js';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { createLogger } from '../utils/logger.js';
import { AWSError } from '../utils/errorHandler.js';

const logger = createLogger();
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'math-phoenix-sessions';

/**
 * Get all sessions from DynamoDB
 * @returns {Promise<Array>} Array of session objects
 */
export async function getAllSessions() {
  try {
    const sessions = [];
    let lastEvaluatedKey = null;

    do {
      const params = {
        TableName: TABLE_NAME
      };

      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }

      const result = await dynamoDocClient.send(new ScanCommand(params));
      
      if (result.Items) {
        // Filter out expired sessions
        const now = Math.floor(Date.now() / 1000);
        const activeSessions = result.Items.filter(
          session => !session.expires_at || session.expires_at >= now
        );
        sessions.push(...activeSessions);
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    logger.info(`Retrieved ${sessions.length} active sessions`);
    return sessions;
  } catch (error) {
    logger.error('Error scanning sessions:', error);
    throw new AWSError('Failed to retrieve sessions', error);
  }
}

/**
 * Compute aggregate statistics from all sessions
 * @returns {Promise<Object>} Aggregate stats object
 */
export async function getAggregateStats() {
  const sessions = await getAllSessions();

  const stats = {
    totalSessions: sessions.length,
    totalProblems: 0,
    totalHints: 0,
    categories: {
      arithmetic: 0,
      algebra: 0,
      geometry: 0,
      word: 0,
      'multi-step': 0,
      other: 0
    },
    difficulties: {
      easy: 0,
      medium: 0,
      hard: 0,
      unknown: 0
    }
  };

  sessions.forEach(session => {
    const problems = session.problems || [];
    
    problems.forEach(problem => {
      stats.totalProblems++;
      
      // Count hints
      if (problem.hints_used_total) {
        stats.totalHints += problem.hints_used_total;
      }

      // Count by category
      const category = problem.category || problem.problem_info?.category || 'other';
      if (stats.categories[category]) {
        stats.categories[category]++;
      } else {
        stats.categories.other++;
      }

      // Count by difficulty
      const difficulty = problem.difficulty || problem.problem_info?.difficulty || 'unknown';
      if (stats.difficulties[difficulty]) {
        stats.difficulties[difficulty]++;
      } else {
        stats.difficulties.unknown++;
      }
    });
  });

  return stats;
}

/**
 * Get all sessions with their statistics
 * @returns {Promise<Array>} Array of session objects with computed stats
 */
export async function getAllSessionsWithStats() {
  const sessions = await getAllSessions();

  return sessions.map(session => {
    const problems = session.problems || [];
    
    const sessionStats = {
      session_code: session.session_code,
      created_at: session.created_at,
      problems_count: problems.length,
      hints_used_total: 0,
      categories: {},
      difficulties: {},
      problems: problems.map(p => ({
        problem_id: p.problem_id,
        category: p.category || p.problem_info?.category || 'other',
        difficulty: p.difficulty || p.problem_info?.difficulty || 'unknown',
        hints_used: p.hints_used_total || 0,
        created_at: p.created_at,
        completed: p.completed || false
      }))
    };

    // Calculate totals
    problems.forEach(problem => {
      const hints = problem.hints_used_total || 0;
      sessionStats.hints_used_total += hints;

      const category = problem.category || problem.problem_info?.category || 'other';
      sessionStats.categories[category] = (sessionStats.categories[category] || 0) + 1;

      const difficulty = problem.difficulty || problem.problem_info?.difficulty || 'unknown';
      sessionStats.difficulties[difficulty] = (sessionStats.difficulties[difficulty] || 0) + 1;
    });

    return sessionStats;
  });
}

/**
 * Get specific session details
 * @param {string} sessionCode - Session code
 * @returns {Promise<Object>} Session object with full details
 */
export async function getSessionDetails(sessionCode) {
  const sessions = await getAllSessions();
  const session = sessions.find(s => s.session_code === sessionCode);

  if (!session) {
    return null;
  }

  return {
    session_code: session.session_code,
    created_at: session.created_at,
    expires_at: session.expires_at,
    current_problem_id: session.current_problem_id,
    problems: session.problems || [],
    transcript: session.transcript || [],
    transcript_length: (session.transcript || []).length
  };
}

