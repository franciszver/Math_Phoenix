/**
 * Session Management Service
 * Handles DynamoDB operations for session storage
 */

import '../config/env.js';
import { dynamoDocClient } from './aws.js';
import { PutCommand, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { createLogger } from '../utils/logger.js';
import { NotFoundError, AWSError } from '../utils/errorHandler.js';
import { generateSessionCode, validateSessionCode } from '../utils/sessionCode.js';

const logger = createLogger();
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'math-phoenix-sessions';

/**
 * Create a new session
 * @param {string} sessionCode - Optional session code (will generate if not provided)
 * @returns {Promise<Object>} Session object with session_code, created_at, expires_at
 */
export async function createSession(sessionCode = null) {
  const code = sessionCode || generateSessionCode();
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

  const session = {
    session_code: code,
    created_at: now.toISOString(),
    expires_at: Math.floor(expiresAt.getTime() / 1000), // Unix timestamp for TTL
    problems: [],
    transcript: []
  };

  try {
    await dynamoDocClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: session
      })
    );

    logger.info(`Session created: ${code}`);
    return session;
  } catch (error) {
    logger.error('Error creating session:', error);
    logger.error('Error details:', {
      message: error.message,
      name: error.name,
      code: error.code,
      tableName: TABLE_NAME
    });
    throw new AWSError(`Failed to create session: ${error.message}`, error);
  }
}

/**
 * Get session by code
 * @param {string} sessionCode - Session code
 * @returns {Promise<Object>} Session object
 */
export async function getSession(sessionCode) {
  if (!validateSessionCode(sessionCode)) {
    throw new Error('Invalid session code format');
  }

  try {
    const result = await dynamoDocClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { session_code: sessionCode }
      })
    );

    if (!result.Item) {
      throw new NotFoundError('Session');
    }

    // Check if session is expired (TTL handles deletion, but check for safety)
    const now = Math.floor(Date.now() / 1000);
    if (result.Item.expires_at && result.Item.expires_at < now) {
      throw new NotFoundError('Session has expired');
    }

    return result.Item;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Error getting session:', error);
    throw new AWSError('Failed to get session', error);
  }
}

/**
 * Update session with new problem or chat message
 * @param {string} sessionCode - Session code
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated session
 */
export async function updateSession(sessionCode, updates) {
  if (!validateSessionCode(sessionCode)) {
    throw new Error('Invalid session code format');
  }

  // First verify session exists
  await getSession(sessionCode);

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
        Key: { session_code: sessionCode },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      })
    );

    logger.debug(`Session updated: ${sessionCode}`);
    return result.Attributes;
  } catch (error) {
    logger.error('Error updating session:', error);
    throw new AWSError('Failed to update session', error);
  }
}

/**
 * Add problem to session
 * @param {string} sessionCode - Session code
 * @param {Object} problem - Problem object
 * @returns {Promise<Object>} Updated session
 */
export async function addProblemToSession(sessionCode, problem) {
  const session = await getSession(sessionCode);
  
  // Check if there's already an active problem (one problem at a time)
  const activeProblem = session.problems?.find(p => !p.completed);
  if (activeProblem) {
    throw new Error('A problem is already active in this session. Complete it before starting a new one.');
  }

  // Generate problem ID (incremental)
  const problemId = `P${String((session.problems?.length || 0) + 1).padStart(3, '0')}`;
  problem.problem_id = problemId;
  problem.completed = false;
  problem.created_at = new Date().toISOString();
  problem.steps = problem.steps || [];

  const updatedProblems = [...(session.problems || []), problem];

  return await updateSession(sessionCode, {
    problems: updatedProblems,
    current_problem_id: problemId
  });
}

/**
 * Add step to current problem
 * @param {string} sessionCode - Session code
 * @param {Object} step - Step object
 * @returns {Promise<Object>} Updated session
 */
export async function addStepToProblem(sessionCode, step) {
  const session = await getSession(sessionCode);
  
  if (!session.current_problem_id) {
    throw new Error('No active problem in this session');
  }

  const problem = session.problems.find(p => p.problem_id === session.current_problem_id);
  if (!problem) {
    throw new NotFoundError('Current problem');
  }

  if (problem.completed) {
    throw new Error('This problem is already completed');
  }

  // Generate step number
  const stepNumber = (problem.steps?.length || 0) + 1;
  step.step_number = stepNumber;
  step.timestamp = new Date().toISOString();

  const updatedSteps = [...(problem.steps || []), step];
  problem.steps = updatedSteps;

  // Update hints_used_total if hint was used
  if (step.hint_used) {
    problem.hints_used_total = (problem.hints_used_total || 0) + 1;
  }

  // Update the problem in the problems array
  const updatedProblems = session.problems.map(p => 
    p.problem_id === session.current_problem_id ? problem : p
  );

  return await updateSession(sessionCode, {
    problems: updatedProblems
  });
}

/**
 * Add message to transcript
 * @param {string} sessionCode - Session code
 * @param {string} speaker - 'student' or 'tutor'
 * @param {string} message - Message content
 * @returns {Promise<Object>} Updated session
 */
export async function addToTranscript(sessionCode, speaker, message) {
  const session = await getSession(sessionCode);
  
  const transcriptEntry = {
    speaker,
    message,
    timestamp: new Date().toISOString()
  };

  const updatedTranscript = [...(session.transcript || []), transcriptEntry];

  return await updateSession(sessionCode, {
    transcript: updatedTranscript
  });
}

/**
 * Delete a session
 * @param {string} sessionCode - Session code
 * @returns {Promise<void>}
 */
export async function deleteSession(sessionCode) {
  if (!validateSessionCode(sessionCode)) {
    throw new Error('Invalid session code format');
  }

  // First verify session exists
  await getSession(sessionCode);

  try {
    await dynamoDocClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { session_code: sessionCode }
      })
    );

    logger.info(`Session deleted: ${sessionCode}`);
  } catch (error) {
    logger.error('Error deleting session:', error);
    throw new AWSError('Failed to delete session', error);
  }
}

