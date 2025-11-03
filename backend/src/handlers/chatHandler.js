/**
 * Chat API Handler
 * Handles conversation messages in Socratic dialogue
 */

import { getSession, addStepToProblem, addToTranscript } from '../services/sessionService.js';
import { processStudentResponse } from '../services/socraticEngine.js';
import { createLogger } from '../utils/logger.js';
import { ValidationError, NotFoundError } from '../utils/errorHandler.js';
import { validateSessionCode } from '../utils/sessionCode.js';

const logger = createLogger();

/**
 * POST /api/sessions/:code/chat
 * Send a message in the conversation
 */
export async function sendChatMessageHandler(req, res, next) {
  try {
    const { code } = req.params;
    const { message, session_code } = req.body;

    // Validate session code
    const sessionCode = code || session_code;
    if (!validateSessionCode(sessionCode)) {
      throw new ValidationError('Invalid session code format', 'session_code');
    }

    // Validate message
    if (!message || message.trim().length === 0) {
      throw new ValidationError('Message cannot be empty', 'message');
    }

    // Get session
    const session = await getSession(sessionCode);

    // Check if there's an active problem
    if (!session.current_problem_id) {
      throw new ValidationError('No active problem in this session. Please submit a problem first.', 'session');
    }

    // Get current problem
    const currentProblem = session.problems.find(
      p => p.problem_id === session.current_problem_id && !p.completed
    );

    if (!currentProblem) {
      throw new NotFoundError('Current problem');
    }

    // Get conversation steps
    const steps = currentProblem.steps || [];

    // Process student response
    const result = await processStudentResponse({
      studentResponse: message.trim(),
      problem: currentProblem,
      steps
    });

    // Add step to problem
    const updatedSession = await addStepToProblem(sessionCode, result.step);

    // Add to transcript
    await addToTranscript(sessionCode, 'student', message.trim());
    await addToTranscript(sessionCode, 'tutor', result.tutorMessage);

    // Get updated problem
    const updatedProblem = updatedSession.problems.find(
      p => p.problem_id === session.current_problem_id
    );

    // Get latest step number
    const stepNumber = updatedProblem.steps.length;

    res.json({
      session_code: sessionCode,
      tutor_message: result.tutorMessage,
      conversation_context: {
        step_number: stepNumber,
        hints_used: updatedProblem.hints_used_total || 0,
        progress_made: result.step.progress_made,
        stuck_turns: result.step.stuck_turns
      }
    });
  } catch (error) {
    next(error);
  }
}

