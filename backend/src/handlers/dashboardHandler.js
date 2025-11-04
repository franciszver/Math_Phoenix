/**
 * Dashboard API Handlers
 */

import { generateDashboardToken } from '../middleware/auth.js';
import { getAggregateStats, getAllSessionsWithStats, getSessionDetails } from '../services/dashboardService.js';
import { getSession, updateSession, deleteSession } from '../services/sessionService.js';
import { collectMLData } from '../services/mlDataService.js';
import { createLogger } from '../utils/logger.js';
import { ValidationError, NotFoundError } from '../utils/errorHandler.js';

const logger = createLogger();

/**
 * POST /api/dashboard/login
 * Login with dashboard password
 */
export async function loginHandler(req, res, next) {
  try {
    const { password } = req.body;

    if (!password) {
      throw new ValidationError('Password is required', 'password');
    }

    try {
      const token = generateDashboardToken(password);
      
      logger.info('Dashboard login successful');
      res.json({
        success: true,
        token,
        expiresIn: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
      });
    } catch (error) {
      // Invalid password
      logger.warn('Dashboard login failed: invalid password');
      res.status(401).json({
        error: {
          message: 'Invalid password',
          code: 'AUTH_ERROR'
        }
      });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/dashboard/stats/aggregate
 * Get aggregate statistics across all sessions
 */
export async function getAggregateStatsHandler(req, res, next) {
  try {
    const stats = await getAggregateStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/dashboard/sessions
 * Get all sessions with statistics
 */
export async function getAllSessionsHandler(req, res, next) {
  try {
    const sessions = await getAllSessionsWithStats();
    res.json({ sessions });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/dashboard/sessions/:code
 * Get detailed information about a specific session
 */
export async function getSessionDetailsHandler(req, res, next) {
  try {
    const { code } = req.params;
    const session = await getSessionDetails(code);

    if (!session) {
      throw new NotFoundError('Session');
    }

    res.json(session);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/dashboard/sessions/:code/problems/:problemId
 * Update problem tags (category or difficulty)
 */
export async function updateProblemTagsHandler(req, res, next) {
  try {
    const { code, problemId } = req.params;
    const { category, difficulty } = req.body;

    if (!category && !difficulty) {
      throw new ValidationError('At least one of category or difficulty must be provided');
    }

    // Validate category if provided
    const validCategories = ['arithmetic', 'algebra', 'geometry', 'word', 'multi-step', 'other'];
    if (category && !validCategories.includes(category)) {
      throw new ValidationError(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
    }

    // Validate difficulty if provided
    const validDifficulties = ['easy', 'medium', 'hard', 'unknown'];
    if (difficulty && !validDifficulties.includes(difficulty)) {
      throw new ValidationError(`Invalid difficulty. Must be one of: ${validDifficulties.join(', ')}`);
    }

    // Get session
    const session = await getSession(code);
    
    // Find the problem
    const problemIndex = session.problems.findIndex(p => p.problem_id === problemId);
    if (problemIndex === -1) {
      throw new NotFoundError('Problem');
    }

    // Update problem tags
    const updatedProblems = [...session.problems];
    if (category) {
      updatedProblems[problemIndex].category = category;
      // Also update problem_info if it exists
      if (updatedProblems[problemIndex].problem_info) {
        updatedProblems[problemIndex].problem_info.category = category;
      }
    }
    if (difficulty) {
      updatedProblems[problemIndex].difficulty = difficulty;
      // Also update problem_info if it exists
      if (updatedProblems[problemIndex].problem_info) {
        updatedProblems[problemIndex].problem_info.difficulty = difficulty;
      }
    }

    // Update session in DynamoDB
    await updateSession(code, { problems: updatedProblems });

    logger.info(`Updated problem ${problemId} tags in session ${code}`);

    // Collect ML training data with teacher override flag (non-blocking)
    const updatedSession = await getSession(code);
    collectMLData(updatedProblems[problemIndex], updatedSession, null, true)
      .catch(error => {
        logger.warn('ML data collection failed after teacher override (non-critical):', error);
      });

    res.json({
      success: true,
      problem: updatedProblems[problemIndex]
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/dashboard/sessions/:code
 * Delete a session
 */
export async function deleteSessionHandler(req, res, next) {
  try {
    const { code } = req.params;

    await deleteSession(code);

    logger.info(`Session ${code} deleted by dashboard user`);
    
    res.json({
      success: true,
      message: 'Session deleted successfully'
    });
  } catch (error) {
    next(error);
  }
}

