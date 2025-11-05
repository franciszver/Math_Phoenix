/**
 * OpenAI Service
 * Centralized configuration for OpenAI client
 * Uses lazy initialization to allow Parameter Store values to load first
 */

import '../config/env.js'; // Load environment variables first
import OpenAI from 'openai';
import { createLogger } from '../utils/logger.js';
import { OpenAIError } from '../utils/errorHandler.js';

const logger = createLogger();

// Lazy initialization - client is created on first access
let _openaiClient = null;

function getOpenAIClient() {
  if (!_openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OPENAI_API_KEY not found in environment variables');
      // In production, Parameter Store might still be loading
      // Allow client creation but it will fail on actual API calls
    }
    _openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return _openaiClient;
}

// Export a getter that lazily initializes the client
export const openai = new Proxy({}, {
  get(target, prop) {
    const client = getOpenAIClient();
    const value = client[prop];
    // If it's a function, bind it to the client
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
});

/**
 * Validate OpenAI configuration
 */
export function validateOpenAIConfig() {
  if (!process.env.OPENAI_API_KEY) {
    throw new OpenAIError('OPENAI_API_KEY is required');
  }
  return true;
}

/**
 * Test OpenAI connection
 */
export async function testOpenAIConnection() {
  try {
    validateOpenAIConfig();
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Test' }],
      max_tokens: 5
    });
    return { success: true, model: response.model };
  } catch (error) {
    logger.error('OpenAI connection test failed:', error);
    throw new OpenAIError('Failed to connect to OpenAI API', error);
  }
}

logger.debug('OpenAI client initialized');

