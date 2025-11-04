/**
 * Metrics Service
 * Tracks OCR/Vision performance metrics for CloudWatch monitoring
 */

import '../config/env.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

/**
 * Track OCR performance metrics
 * @param {Object} metrics - Performance metrics
 * @param {string} metrics.source - 'textract' or 'vision'
 * @param {boolean} metrics.success - Whether extraction succeeded
 * @param {number} metrics.confidence - Confidence score (0-1)
 * @param {number} metrics.latency - Processing time in milliseconds
 * @param {string} metrics.error - Error message if failed
 */
export function trackOCRMetrics({ source, success, confidence, latency, error = null }) {
  const dimensions = {
    source,
    success: success ? 'true' : 'false'
  };

  // Log metrics for CloudWatch
  logger.metric('OCR.Attempt', 1, 'Count', dimensions);
  
  if (success) {
    logger.metric('OCR.Success', 1, 'Count', { source });
    logger.metric('OCR.Confidence', confidence, 'Percent', { source });
    logger.metric('OCR.Latency', latency, 'Milliseconds', { source });
  } else {
    logger.metric('OCR.Failure', 1, 'Count', { source, error: error || 'unknown' });
  }

  // Structured log for detailed analysis
  logger.info('OCR performance', {
    source,
    success,
    confidence,
    latency_ms: latency,
    error: error || null
  });
}

/**
 * Track fallback usage (Textract -> Vision)
 */
export function trackFallback() {
  logger.metric('OCR.Fallback', 1, 'Count', { from: 'textract', to: 'vision' });
  logger.info('OCR fallback triggered', { from: 'textract', to: 'vision' });
}

/**
 * Track overall OCR pipeline performance
 * @param {Object} result - Final extraction result
 * @param {number} totalLatency - Total processing time
 */
export function trackPipelineMetrics(result, totalLatency) {
  const finalSuccess = result.success && result.text && result.text.trim().length > 0;
  
  logger.metric('OCR.Pipeline.Success', finalSuccess ? 1 : 0, 'Count');
  logger.metric('OCR.Pipeline.Latency', totalLatency, 'Milliseconds');
  
  if (finalSuccess) {
    logger.info('OCR pipeline completed successfully', {
      source: result.source,
      confidence: result.confidence,
      text_length: result.text.length,
      total_latency_ms: totalLatency
    });
  } else {
    logger.warn('OCR pipeline failed', {
      source: result.source,
      fallback_failed: result.fallback_failed || false,
      total_latency_ms: totalLatency
    });
  }
}

