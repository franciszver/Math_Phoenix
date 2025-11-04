/**
 * Collaboration Session Management Service
 * Handles DynamoDB operations for collaboration sessions
 */

import '../config/env.js';
import { dynamoDocClient } from './aws.js';
import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createLogger } from '../utils/logger.js';
import { NotFoundError, AWSError } from '../utils/errorHandler.js';
import { generateSessionCode } from '../utils/sessionCode.js';
import { getSession, updateSession } from './sessionService.js';

const logger = createLogger();
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'math-phoenix-sessions';

/**
 * Generate collaboration session ID
 * Format: COLLAB followed by 6 alphanumeric characters
 * @returns {string} Collaboration session ID
 */
function generateCollaborationSessionId() {
  const code = generateSessionCode();
  return `COLLAB${code}`;
}

/**
 * Create a new collaboration session
 * @param {string} studentSessionId - Student session ID
 * @param {string} selectedProblemId - ID of the original problem
 * @param {string} problemText - Similar problem text selected by teacher
 * @returns {Promise<Object>} Collaboration session object
 */
export async function createCollaborationSession(studentSessionId, selectedProblemId, problemText) {
  // Verify student session exists
  await getSession(studentSessionId);

  // Check if student already has an active collaboration
  const existingCollab = await getActiveCollaborationByStudent(studentSessionId);
  if (existingCollab) {
    // Return the existing collaboration session ID so frontend can navigate to it
    const error = new Error('Student already has an active collaboration session');
    error.existingCollaborationId = existingCollab.collaboration_session_id;
    throw error;
  }

  const collabSessionId = generateCollaborationSessionId();
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

  const collaborationSession = {
    session_code: collabSessionId, // Primary key - must be session_code for DynamoDB table
    collaboration_session_id: collabSessionId, // Keep for reference
    student_session_id: studentSessionId,
    selected_problem_id: selectedProblemId,
    problem_text: problemText,
    created_at: now.toISOString(),
    expires_at: Math.floor(expiresAt.getTime() / 1000), // Unix timestamp for TTL
    messages: [],
    canvas_state: null,
    student_can_draw: false, // Disabled by default - teacher can enable it
    status: 'active'
  };

  try {
    await dynamoDocClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: collaborationSession
      })
    );

    // Set collaboration_requested flag on student session
    await updateSession(studentSessionId, {
      collaboration_requested: true,
      collaboration_session_id: collabSessionId
    });

    logger.info(`Collaboration session created: ${collabSessionId} for student ${studentSessionId}`);
    return collaborationSession;
  } catch (error) {
    logger.error('Error creating collaboration session:', error);
    throw new AWSError(`Failed to create collaboration session: ${error.message}`, error);
  }
}

/**
 * Get active collaboration session for a student
 * @param {string} studentSessionId - Student session ID
 * @returns {Promise<Object|null>} Active collaboration session or null
 */
async function getActiveCollaborationByStudent(studentSessionId) {
  try {
    // This is a simplified approach - in production, you might want a GSI
    // For MVP, we'll store collaboration_session_id in student session
    const studentSession = await getSession(studentSessionId);
    const collabSessionId = studentSession.collaboration_session_id;
    
    if (!collabSessionId) {
      return null;
    }

    return await getCollaborationSession(collabSessionId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null;
    }
    throw error;
  }
}

/**
 * Get collaboration session by ID
 * @param {string} collabSessionId - Collaboration session ID
 * @returns {Promise<Object>} Collaboration session object
 */
export async function getCollaborationSession(collabSessionId) {
  if (!collabSessionId || !collabSessionId.startsWith('COLLAB')) {
    throw new Error('Invalid collaboration session ID format');
  }

  try {
    const result = await dynamoDocClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { session_code: collabSessionId } // Use session_code as primary key
      })
    );

    if (!result.Item) {
      throw new NotFoundError('Collaboration session');
    }

    // Check if session is expired
    const now = Math.floor(Date.now() / 1000);
    if (result.Item.expires_at && result.Item.expires_at < now) {
      throw new NotFoundError('Collaboration session has expired');
    }

    return result.Item;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Error getting collaboration session:', error);
    throw new AWSError('Failed to get collaboration session', error);
  }
}

/**
 * Add message to collaboration session
 * @param {string} collabSessionId - Collaboration session ID
 * @param {string} speaker - 'teacher' or 'student'
 * @param {string} message - Message content
 * @param {Object|null} canvasState - Optional canvas state update
 * @returns {Promise<Object>} Updated collaboration session
 */
export async function addCollaborationMessage(collabSessionId, speaker, message, canvasState = null) {
  if (speaker !== 'teacher' && speaker !== 'student') {
    throw new Error('Speaker must be "teacher" or "student"');
  }

  const session = await getCollaborationSession(collabSessionId);

  const messageEntry = {
    speaker,
    message,
    timestamp: new Date().toISOString(),
    canvas_update: canvasState || null
  };

  const updatedMessages = [...(session.messages || []), messageEntry];

  // Update canvas state if provided
  const updates = {
    messages: updatedMessages
  };

  if (canvasState !== null) {
    updates.canvas_state = canvasState;
  }

  return await updateCollaborationSession(collabSessionId, updates);
}

/**
 * Update canvas state
 * @param {string} collabSessionId - Collaboration session ID
 * @param {Object} canvasState - Fabric.js canvas state JSON
 * @returns {Promise<Object>} Updated collaboration session
 */
export async function updateCanvasState(collabSessionId, canvasState) {
  const result = await updateCollaborationSession(collabSessionId, {
    canvas_state: canvasState
  });
  return result;
}

/**
 * Update drawing permission
 * @param {string} collabSessionId - Collaboration session ID
 * @param {boolean} studentCanDraw - Whether student can draw
 * @returns {Promise<Object>} Updated collaboration session
 */
export async function updateDrawingPermission(collabSessionId, studentCanDraw) {
  return await updateCollaborationSession(collabSessionId, {
    student_can_draw: studentCanDraw === true
  });
}

/**
 * Update collaboration session
 * @param {string} collabSessionId - Collaboration session ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated collaboration session
 */
async function updateCollaborationSession(collabSessionId, updates) {
  // Verify session exists
  await getCollaborationSession(collabSessionId);

  // Build update expression
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  Object.keys(updates).forEach((key, index) => {
    const attrName = `#attr${index}`;
    const attrValue = `:val${index}`;
    
    updateExpressions.push(`${attrName} = ${attrValue}`);
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrValue] = updates[key];
  });

  try {
    const result = await dynamoDocClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { session_code: collabSessionId }, // Use session_code as primary key
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      })
    );

    logger.debug(`Collaboration session updated: ${collabSessionId}`);
    return result.Attributes;
  } catch (error) {
    logger.error('Error updating collaboration session:', error);
    throw new AWSError('Failed to update collaboration session', error);
  }
}

/**
 * End collaboration session
 * @param {string} collabSessionId - Collaboration session ID
 * @returns {Promise<Object>} Updated collaboration session
 */
export async function endCollaboration(collabSessionId) {
  const session = await getCollaborationSession(collabSessionId);
  
  // Update collaboration session status
  const updatedSession = await updateCollaborationSession(collabSessionId, {
    status: 'completed',
    ended_at: new Date().toISOString()
  });

  // Clear collaboration flags on student session
  try {
    await updateSession(session.student_session_id, {
      collaboration_requested: false,
      collaboration_session_id: null
    });
  } catch (error) {
    logger.warn(`Failed to clear collaboration flags on student session: ${error.message}`);
    // Don't fail the whole operation if this fails
  }

  logger.info(`Collaboration session ended: ${collabSessionId}`);
  return updatedSession;
}

/**
 * Get updates since a timestamp (for polling)
 * @param {string} collabSessionId - Collaboration session ID
 * @param {string} sinceTimestamp - ISO timestamp to get updates since
 * @returns {Promise<Object>} Updates object with messages and canvas state
 */
export async function getCollaborationUpdates(collabSessionId, sinceTimestamp) {
  const session = await getCollaborationSession(collabSessionId);
  
  // Filter messages since timestamp
  // Use > (not >=) to get messages strictly after the timestamp
  // This ensures we don't get duplicate messages
  const sinceDate = new Date(sinceTimestamp);
  const messages = (session.messages || []).filter(msg => {
    const msgDate = new Date(msg.timestamp);
    return msgDate > sinceDate;
  });

  return {
    messages,
    canvas_state: session.canvas_state,
    student_can_draw: session.student_can_draw,
    status: session.status
  };
}

