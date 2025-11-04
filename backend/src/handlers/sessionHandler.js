/**
 * Session API Handlers
 */

import { createSession, getSession } from '../services/sessionService.js';
import { createLogger } from '../utils/logger.js';
import { ValidationError, NotFoundError } from '../utils/errorHandler.js';
import { validateSessionCode } from '../utils/sessionCode.js';

const logger = createLogger();

/**
 * GET /api/sessions/:code
 * Get session details
 */
export async function getSessionHandler(req, res, next) {
  try {
    const { code } = req.params;

    if (!validateSessionCode(code)) {
      throw new ValidationError('Invalid session code format', 'session_code');
    }

    const session = await getSession(code);

    res.json({
      session_code: session.session_code,
      created_at: session.created_at,
      problems: session.problems || [],
      current_problem_id: session.current_problem_id || null,
      transcript: session.transcript || []
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
    const { session_code } = req.body;

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
          transcript: session.transcript || []
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

