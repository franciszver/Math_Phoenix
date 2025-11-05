/**
 * Collaboration API Handlers
 */

import {
  createCollaborationSession,
  getCollaborationSession,
  addCollaborationMessage,
  updateCanvasState,
  updateDrawingPermission,
  endCollaboration,
  getCollaborationUpdates
} from '../services/collaborationService.js';
import { createLogger } from '../utils/logger.js';
import { ValidationError, NotFoundError } from '../utils/errorHandler.js';

const logger = createLogger();

/**
 * POST /api/dashboard/sessions/:studentSessionId/collaboration/start
 * Teacher starts collaboration
 */
export async function startCollaborationHandler(req, res, next) {
  try {
    const { studentSessionId } = req.params;
    const { problemText, selectedProblemId } = req.body;

    if (!problemText || !selectedProblemId) {
      throw new ValidationError('problemText and selectedProblemId are required');
    }

    const collaborationSession = await createCollaborationSession(
      studentSessionId,
      selectedProblemId,
      problemText
    );

    // Generate collaboration URL
    const collaborationUrl = `/collaboration/${collaborationSession.collaboration_session_id}`;

    logger.info(`Collaboration started: ${collaborationSession.collaboration_session_id} for student ${studentSessionId}`);

    res.json({
      success: true,
      collaboration_session_id: collaborationSession.collaboration_session_id,
      collaboration_url: collaborationUrl
    });
  } catch (error) {
    // If there's an existing collaboration, return it with the error
    if (error.message === 'Student already has an active collaboration session' && error.existingCollaborationId) {
      return res.status(409).json({
        error: 'existing_collaboration',
        message: error.message,
        collaboration_session_id: error.existingCollaborationId,
        collaboration_url: `/collaboration/${error.existingCollaborationId}`
      });
    }
    next(error);
  }
}

/**
 * GET /api/collaboration/:collabSessionId
 * Get collaboration session details
 */
export async function getCollaborationHandler(req, res, next) {
  try {
    const { collabSessionId } = req.params;

    const session = await getCollaborationSession(collabSessionId);

    res.json(session);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/collaboration/:collabSessionId/message
 * Send chat message
 */
export async function sendCollaborationMessageHandler(req, res, next) {
  try {
    const { collabSessionId } = req.params;
    const { message, speaker } = req.body;

    if (!message || !speaker) {
      throw new ValidationError('message and speaker are required');
    }

    if (speaker !== 'teacher' && speaker !== 'student') {
      throw new ValidationError('speaker must be "teacher" or "student"');
    }

    const updatedSession = await addCollaborationMessage(
      collabSessionId,
      speaker,
      message
    );

    res.json({
      success: true,
      message: updatedSession.messages[updatedSession.messages.length - 1]
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/collaboration/:collabSessionId/canvas
 * Update canvas state
 */
export async function updateCanvasHandler(req, res, next) {
  try {
    const { collabSessionId } = req.params;
    const { canvasState } = req.body;

    if (canvasState === undefined) {
      throw new ValidationError('canvasState is required');
    }

    const updatedSession = await updateCanvasState(collabSessionId, canvasState);
    res.json({
      success: true,
      canvas_state: updatedSession.canvas_state
    });
  } catch (error) {
    logger.error(`Error updating canvas for ${collabSessionId}:`, error);
    next(error);
  }
}

/**
 * GET /api/collaboration/:collabSessionId/updates
 * Polling endpoint for updates
 */
export async function getCollaborationUpdatesHandler(req, res, next) {
  try {
    const { collabSessionId } = req.params;
    const { since } = req.query;

    if (!since) {
      throw new ValidationError('since query parameter is required (ISO timestamp)');
    }

    const updates = await getCollaborationUpdates(collabSessionId, since);

    res.json(updates);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/collaboration/:collabSessionId/drawing-permission
 * Toggle student drawing permission
 */
export async function updateDrawingPermissionHandler(req, res, next) {
  try {
    const { collabSessionId } = req.params;
    const { student_can_draw } = req.body;

    if (student_can_draw === undefined) {
      throw new ValidationError('student_can_draw is required (boolean)');
    }

    const updatedSession = await updateDrawingPermission(
      collabSessionId,
      student_can_draw
    );

    res.json({
      success: true,
      student_can_draw: updatedSession.student_can_draw
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/collaboration/:collabSessionId/end
 * End collaboration
 */
export async function endCollaborationHandler(req, res, next) {
  try {
    const { collabSessionId } = req.params;

    const endedSession = await endCollaboration(collabSessionId);

    res.json({
      success: true,
      message: 'Collaboration ended',
      session: endedSession
    });
  } catch (error) {
    next(error);
  }
}

