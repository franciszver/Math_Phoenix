/**
 * OpenAI Service
 * Centralized configuration for OpenRouter-backed OpenAI-compatible client
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
    if (!process.env.OPENROUTER_API_KEY) {
      logger.warn('OPENROUTER_API_KEY not found in environment variables');
      // In production, Parameter Store might still be loading
      // Allow client creation but it will fail on actual API calls
    }
    _openaiClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      // Fail fast: createChatCompletion does its own single fallback-model
      // retry; the SDK's default internal retries (2x with backoff) stack
      // with it and balloon worst-case latency on free-tier 429s.
      maxRetries: 0
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

export const TEXT_MODEL = process.env.TEXT_MODEL || 'openai/gpt-oss-20b:free';
export const VISION_MODEL = process.env.VISION_MODEL || 'google/gemma-4-31b-it:free';
export const TEXT_MODEL_FALLBACK = process.env.TEXT_MODEL_FALLBACK || 'meta-llama/llama-3.3-70b-instruct:free';
export const VISION_MODEL_FALLBACK = process.env.VISION_MODEL_FALLBACK || 'nvidia/nemotron-nano-12b-v2-vl:free';

// Test-only seam: lets tests intercept the raw API call without hitting the network.
// Set via __setChatCompletionOverride(fn); pass null to restore real client behavior.
let _chatCompletionOverride = null;

export function __setChatCompletionOverride(fn) {
  _chatCompletionOverride = fn;
}

async function callChatCompletion(params) {
  if (_chatCompletionOverride) {
    return _chatCompletionOverride(params);
  }
  return openai.chat.completions.create(params);
}

/**
 * Validate OpenRouter configuration
 */
export function validateOpenAIConfig() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new OpenAIError('OPENROUTER_API_KEY is required');
  }
  return true;
}

// Detects OpenRouter free-tier responses that are "successful" (HTTP 200 / no
// thrown error) but carry no usable content: in-band {error} bodies, or a
// reasoning model that burned its whole max_tokens budget on internal
// reasoning and returned content:null/'' with finish_reason 'length'.
function isEmptyOrErrorResponse(response) {
  if (!response) return true;
  if (response.error) return true;
  const choice = response.choices?.[0];
  if (!choice) return true;
  const content = choice.message?.content;
  if ((content === null || content === '') && choice.finish_reason === 'length') return true;
  return false;
}

/**
 * Create a chat completion, retrying once with a fallback model on
 * rate-limit (429) or server (5xx) errors, or on a "successful" response
 * that has no usable content (in-band error body, or reasoning budget
 * exhausted before any content was produced).
 */
export async function createChatCompletion(params) {
  const fallbackModel = params.model === VISION_MODEL ? VISION_MODEL_FALLBACK : TEXT_MODEL_FALLBACK;
  try {
    const response = await callChatCompletion(params);
    if (isEmptyOrErrorResponse(response)) {
      logger.warn(`Empty/error-shaped completion from model ${params.model}, retrying with fallback model ${fallbackModel}`);
      const fallbackResponse = await callChatCompletion({ ...params, model: fallbackModel });
      if (isEmptyOrErrorResponse(fallbackResponse)) {
        throw new OpenAIError('Empty completion from model (reasoning budget exhausted?)');
      }
      return fallbackResponse;
    }
    return response;
  } catch (error) {
    if (error instanceof OpenAIError) throw error;
    const status = error?.status ?? error?.response?.status;
    if (status === 429 || status >= 500) {
      logger.warn(`Chat completion failed with status ${status} for model ${params.model}, retrying with fallback model ${fallbackModel}`);
      return callChatCompletion({ ...params, model: fallbackModel });
    }
    throw error;
  }
}

/**
 * Test OpenAI connection
 */
export async function testOpenAIConnection() {
  try {
    validateOpenAIConfig();
    const response = await createChatCompletion({
      model: TEXT_MODEL,
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
