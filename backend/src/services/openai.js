/**
 * OpenAI Service
 * Centralized configuration for OpenAI client
 */

import '../config/env.js'; // Load environment variables first
import OpenAI from 'openai';
import { createLogger } from '../utils/logger.js';
import { OpenAIError } from '../utils/errorHandler.js';

const logger = createLogger();

if (!process.env.OPENAI_API_KEY) {
  logger.warn('OPENAI_API_KEY not found in environment variables');
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
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

