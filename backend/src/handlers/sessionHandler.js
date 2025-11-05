/**
 * Session API Handlers
 */

import { createSession, getSession } from '../services/sessionService.js';
import { createLogger } from '../utils/logger.js';
import { ValidationError, NotFoundError } from '../utils/errorHandler.js';
import { validateSessionCode } from '../utils/sessionCode.js';
import { validateSchoolCode } from '../middleware/auth.js';

const logger = createLogger();

/**
 * GET /api/sessions/:code
 * Get session details
 */
export async function getSessionHandler(req, res, next) {
  try {
    const { code } = req.params;
    const { school_code } = req.query;

    // Validate school code
    validateSchoolCode(school_code);

    if (!validateSessionCode(code)) {
      throw new ValidationError('Invalid session code format', 'session_code');
    }

    const session = await getSession(code);

    res.json({
      session_code: session.session_code,
      created_at: session.created_at,
      problems: session.problems || [],
      current_problem_id: session.current_problem_id || null,
      transcript: session.transcript || [],
      collaboration_requested: session.collaboration_requested || false,
      collaboration_session_id: session.collaboration_session_id || null
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/sessions
 * Create new session or get existing session
 */
export async function createOrGetSessionHandler(req, res, next) {
  try {
    const { session_code, school_code } = req.body;

    // Validate school code (required for both new and resume)
    if (!school_code) {
      throw new ValidationError('School code is required', 'school_code');
    }
    validateSchoolCode(school_code);

    // If session code provided, try to get existing session
    if (session_code) {
      if (!validateSessionCode(session_code)) {
        throw new ValidationError('Invalid session code format', 'session_code');
      }

      try {
        const session = await getSession(session_code);
        return res.json({
          session_code: session.session_code,
          created_at: session.created_at,
          problems: session.problems || [],
          current_problem_id: session.current_problem_id || null,
          transcript: session.transcript || [],
          collaboration_requested: session.collaboration_requested || false,
          collaboration_session_id: session.collaboration_session_id || null
        });
      } catch (error) {
        if (error instanceof NotFoundError) {
          // Session doesn't exist, create new one with provided code
          // (though typically we'd just create a new one)
          logger.warn(`Session ${session_code} not found, creating new session`);
        } else {
          throw error;
        }
      }
    }

    // Create new session
    const session = await createSession();

    res.status(201).json({
      session_code: session.session_code,
      created_at: session.created_at,
      problems: [],
      current_problem_id: null,
      transcript: []
    });
  } catch (error) {
    next(error);
  }
}

