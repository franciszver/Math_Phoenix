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
      very_easy: 0,
      easy: 0,
      medium: 0,
      hard: 0,
      very_hard: 0,
      unknown: 0
    },
    // Learning assessment metrics
    learning: {
      totalAssessed: 0,
      averageConfidence: 0,
      highConfidence: 0, // >= 0.8
      mediumConfidence: 0, // 0.5-0.79
      lowConfidence: 0, // < 0.5
      completionGap: 0, // Problems completed but low confidence
      masteryRate: 0, // Percentage with high confidence
      transferSuccessRate: 0,
      mcAverageScore: 0,
      mcQuizFailures: 0 // MC quizzes failed (< 67%)
    }
  };

  const learningConfidences = [];
  const mcScores = [];
  let transferSuccessCount = 0;
  let transferTotalCount = 0;

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
      // Check if key exists in stats object (not just if value is truthy, since 0 is falsy)
      if (category in stats.categories) {
        stats.categories[category]++;
      } else {
        stats.categories.other++;
      }

      // Count by difficulty
      const difficulty = problem.difficulty || problem.problem_info?.difficulty || 'unknown';
      // Check if key exists in stats object (not just if value is truthy, since 0 is falsy)
      if (difficulty in stats.difficulties) {
        stats.difficulties[difficulty]++;
      } else {
        stats.difficulties.unknown++;
      }

      // Learning assessment metrics
      const assessment = problem.learning_assessment;
      if (assessment && assessment.assessment_completed) {
        stats.learning.totalAssessed++;
        
        const confidence = assessment.learning_confidence || 0;
        learningConfidences.push(confidence);
        
        if (confidence >= 0.8) {
          stats.learning.highConfidence++;
        } else if (confidence >= 0.5) {
          stats.learning.mediumConfidence++;
        } else {
          stats.learning.lowConfidence++;
        }

        // Completion gap: completed but low confidence
        if (problem.completed && confidence < 0.6) {
          stats.learning.completionGap++;
        }

        // MC quiz failed - flag for teacher attention
        if (assessment.mc_quiz_failed) {
          stats.learning.mcQuizFailures = (stats.learning.mcQuizFailures || 0) + 1;
        }

        // MC scores
        if (assessment.mc_score !== null && assessment.mc_score !== undefined) {
          mcScores.push(assessment.mc_score);
        }

        // Transfer problem success
        if (assessment.transfer_success !== null && assessment.transfer_success !== undefined) {
          transferTotalCount++;
          if (assessment.transfer_success) {
            transferSuccessCount++;
          }
        }
      }
    });
  });

  // Calculate averages
  if (learningConfidences.length > 0) {
    stats.learning.averageConfidence = learningConfidences.reduce((a, b) => a + b, 0) / learningConfidences.length;
    stats.learning.masteryRate = stats.learning.highConfidence / stats.learning.totalAssessed;
  }

  if (mcScores.length > 0) {
    stats.learning.mcAverageScore = mcScores.reduce((a, b) => a + b, 0) / mcScores.length;
  }

  if (transferTotalCount > 0) {
    stats.learning.transferSuccessRate = transferSuccessCount / transferTotalCount;
  }

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
      learning: {
        averageConfidence: 0,
        totalAssessed: 0,
        needsIntervention: false, // Flag if average confidence < 0.5
        mcQuizFailures: 0
      },
      problems: problems.map(p => {
        const assessment = p.learning_assessment || {};
        return {
          problem_id: p.problem_id,
          category: p.category || p.problem_info?.category || 'other',
          difficulty: p.difficulty || p.problem_info?.difficulty || 'unknown',
          hints_used: p.hints_used_total || 0,
          created_at: p.created_at,
          completed: p.completed || false,
          learning_assessment: assessment.assessment_completed ? {
            confidence: (assessment.learning_confidence != null && !isNaN(assessment.learning_confidence)) ? assessment.learning_confidence : 0,
            mc_score: assessment.mc_score || 0,
            transfer_success: assessment.transfer_success,
            mc_questions: assessment.mc_questions || [],
            transfer_problem: assessment.transfer_problem,
            mc_quiz_failed: assessment.mc_quiz_failed || false,
            mc_quiz_failed_at: assessment.mc_quiz_failed_at || null
          } : null
        };
      })
    };

    // Calculate totals and learning metrics
    const confidences = [];
    problems.forEach(problem => {
      const hints = problem.hints_used_total || 0;
      sessionStats.hints_used_total += hints;

      const category = problem.category || problem.problem_info?.category || 'other';
      sessionStats.categories[category] = (sessionStats.categories[category] || 0) + 1;

      const difficulty = problem.difficulty || problem.problem_info?.difficulty || 'unknown';
      sessionStats.difficulties[difficulty] = (sessionStats.difficulties[difficulty] || 0) + 1;

      // Learning assessment
      const assessment = problem.learning_assessment;
      if (assessment && assessment.assessment_completed) {
        sessionStats.learning.totalAssessed++;
        const confidence = (assessment.learning_confidence != null && !isNaN(assessment.learning_confidence)) ? assessment.learning_confidence : 0;
        confidences.push(confidence);
        
        // Track MC quiz failures
        if (assessment.mc_quiz_failed) {
          sessionStats.learning.mcQuizFailures++;
        }
      }
    });

    // Calculate average confidence
    if (confidences.length > 0) {
      sessionStats.learning.averageConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
      sessionStats.learning.needsIntervention = sessionStats.learning.averageConfidence < 0.5;
    }

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

  // Transform problems to match the structure expected by frontend
  const problems = (session.problems || []).map(p => {
    const assessment = p.learning_assessment || {};
    return {
      problem_id: p.problem_id,
      category: p.category || p.problem_info?.category || 'other',
      difficulty: p.difficulty || p.problem_info?.difficulty || 'unknown',
      hints_used: p.hints_used_total || 0,
      created_at: p.created_at,
      completed: p.completed || false,
      learning_assessment: assessment.assessment_completed ? {
        confidence: (assessment.learning_confidence != null && !isNaN(assessment.learning_confidence)) ? assessment.learning_confidence : 0,
        mc_score: assessment.mc_score || 0,
        transfer_success: assessment.transfer_success,
        mc_questions: assessment.mc_questions || [],
        transfer_problem: assessment.transfer_problem,
        mc_quiz_failed: assessment.mc_quiz_failed || false,
        mc_quiz_failed_at: assessment.mc_quiz_failed_at || null
      } : null
    };
  });

  return {
    session_code: session.session_code,
    created_at: session.created_at,
    expires_at: session.expires_at,
    current_problem_id: session.current_problem_id,
    problems: problems,
    transcript: session.transcript || [],
    transcript_length: (session.transcript || []).length
  };
}

