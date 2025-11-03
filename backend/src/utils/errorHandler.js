/**
 * Error handling utilities
 */

import { createLogger } from './logger.js';

const logger = createLogger();

export class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class AWSError extends AppError {
  constructor(message, originalError = null) {
    super(message, 500, 'AWS_ERROR');
    this.originalError = originalError;
    this.name = 'AWSError';
  }
}

export class OpenAIError extends AppError {
  constructor(message, originalError = null) {
    super(message, 500, 'OPENAI_ERROR');
    this.originalError = originalError;
    this.name = 'OpenAIError';
  }
}

/**
 * Handle errors and return appropriate response
 */
export function handleError(error, req, res, next) {
  // Safety check - if res already sent, don't try to send again
  if (res.headersSent) {
    return next(error);
  }

  logger.error('Error occurred:', {
    message: error?.message || 'Unknown error',
    stack: error?.stack,
    code: error?.code,
    statusCode: error?.statusCode,
    name: error?.name
  });

  // Known application errors
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: {
        message: error.message,
        code: error.code,
        ...(error.field && { field: error.field }),
        ...(process.env.NODE_ENV === 'development' && error.originalError && {
          originalError: {
            message: error.originalError.message,
            name: error.originalError.name,
            code: error.originalError.code
          }
        })
      }
    });
  }

  // AWS SDK errors
  if (error.$metadata) {
    logger.error('AWS Error:', error);
    return res.status(error.$metadata.httpStatusCode || 500).json({
      error: {
        message: 'AWS service error',
        code: 'AWS_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        awsError: process.env.NODE_ENV === 'development' ? {
          name: error.name,
          code: error.code,
          message: error.message
        } : undefined
      }
    });
  }

  // OpenAI errors
  if (error.status) {
    logger.error('OpenAI Error:', error);
    return res.status(error.status || 500).json({
      error: {
        message: 'OpenAI API error',
        code: 'OPENAI_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    });
  }

  // Unknown errors - catch any issues with error handling itself
  try {
    return res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: process.env.NODE_ENV === 'development' ? (error?.message || String(error)) : undefined
      }
    });
  } catch (handlerError) {
    // If even error handling fails, log and try to send basic response
    logger.error('Error handler itself failed:', handlerError);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
    }
  }
}

