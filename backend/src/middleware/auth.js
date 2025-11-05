/**
 * Authentication Middleware
 * Validates dashboard token for protected routes
 */

import '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { AppError } from '../utils/errorHandler.js';
import crypto from 'crypto';

const logger = createLogger();

// Get password dynamically to ensure Parameter Store values are loaded
function getDashboardPassword() {
  return process.env.DASHBOARD_PASSWORD;
}

// Get session password (school code) dynamically
function getSessionPassword() {
  return process.env.SESSION_PASSWORD;
}

const TOKEN_SECRET = process.env.SESSION_SECRET || 'default-secret-change-in-production';

/**
 * Generate a simple token for dashboard authentication
 * @param {string} password - The password to verify
 * @returns {string} JWT-like token
 */
export function generateDashboardToken(password) {
  const expectedPassword = getDashboardPassword();
  
  if (!expectedPassword) {
    logger.error('DASHBOARD_PASSWORD not set in environment variables');
    throw new AppError('Dashboard authentication not configured', 500, 'CONFIG_ERROR');
  }
  
  if (password !== expectedPassword) {
    throw new AppError('Invalid password', 401, 'AUTH_ERROR');
  }

  // Create a simple signed token (not JWT, but similar concept)
  const payload = {
    type: 'dashboard',
    timestamp: Date.now(),
    expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
  };

  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');

  const token = Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
  return token;
}

/**
 * Verify dashboard token
 * @param {string} token - Token to verify
 * @returns {boolean} True if valid
 */
export function verifyDashboardToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const { payload, signature } = decoded;

    // Check expiration
    if (payload.expires < Date.now()) {
      return false;
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    return signature === expectedSignature && payload.type === 'dashboard';
  } catch (error) {
    logger.debug('Token verification failed:', error);
    return false;
  }
}

/**
 * Middleware to require dashboard authentication
 */
export function requireDashboardAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      }
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  if (!verifyDashboardToken(token)) {
    return res.status(401).json({
      error: {
        message: 'Invalid or expired token',
        code: 'AUTH_INVALID'
      }
    });
  }

  // Token is valid, proceed
  next();
}

/**
 * Validate school code (session password)
 * @param {string} schoolCode - The school code to validate
 * @throws {AppError} If school code is invalid or not configured
 */
export function validateSchoolCode(schoolCode) {
  const expectedCode = getSessionPassword();
  
  if (!expectedCode) {
    logger.error('SESSION_PASSWORD not set in environment variables');
    throw new AppError('School code authentication not configured', 500, 'CONFIG_ERROR');
  }
  
  if (!schoolCode || schoolCode !== expectedCode) {
    throw new AppError('Invalid school code', 401, 'AUTH_ERROR');
  }
  
  return true;
}

