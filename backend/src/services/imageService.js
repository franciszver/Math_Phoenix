/**
 * Image Processing Service
 * Handles S3 upload and OCR pipeline (Textract → Vision fallback)
 */

import '../config/env.js';
import { s3Client, textractClient } from './aws.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { DetectDocumentTextCommand } from '@aws-sdk/client-textract';
import { openai } from './openai.js';
import { createLogger } from '../utils/logger.js';
import { AWSError, OpenAIError } from '../utils/errorHandler.js';
import { trackOCRMetrics, trackFallback, trackPipelineMetrics } from './metricsService.js';
import crypto from 'crypto';

const logger = createLogger();
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'math-phoenix-uploads-20250103';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Validate image file
 * @param {Object} file - Multer file object
 * @returns {Object} Validation result
 */
export function validateImageFile(file) {
  const errors = [];

  if (!file) {
    errors.push('No file provided');
    return { valid: false, errors };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    errors.push(`File size exceeds 5MB limit (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
  }

  // Check file type
  const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    errors.push(`Invalid file type. Allowed: PNG, JPG, JPEG`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Upload image to S3
 * @param {Buffer} imageBuffer - Image buffer
 * @param {string} originalName - Original filename
 * @returns {Promise<Object>} S3 upload result with URL
 */
export async function uploadImageToS3(imageBuffer, originalName) {
  // Generate unique filename
  const fileExtension = originalName.split('.').pop() || 'png';
  const uniqueId = crypto.randomBytes(16).toString('hex');
  const key = `uploads/${Date.now()}-${uniqueId}.${fileExtension}`;

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: imageBuffer,
        ContentType: `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`,
        ACL: 'private' // Images are private by default
      })
    );

    // Generate S3 URL (Note: For production, you'd want to use presigned URLs)
    const region = process.env.AWS_REGION || 'us-east-1';
    const url = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;

    logger.info(`Image uploaded to S3: ${key}`);
    
    return {
      key,
      url,
      bucket: BUCKET_NAME
    };
  } catch (error) {
    logger.error('Error uploading image to S3:', error);
    throw new AWSError('Failed to upload image to S3', error);
  }
}

/**
 * Extract text from image using AWS Textract
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<Object>} Extraction result
 */
export async function extractTextWithTextract(imageBuffer) {
  const startTime = Date.now();
  try {
    const command = new DetectDocumentTextCommand({
      Document: {
        Bytes: imageBuffer
      }
    });

    const response = await textractClient.send(command);
    const latency = Date.now() - startTime;

    // Extract text from blocks
    const lineBlocks = response.Blocks?.filter(block => block.BlockType === 'LINE') || [];
    const textBlocks = lineBlocks
      .map(block => block.Text)
      .filter(text => text)
      .join(' ') || '';

    // Calculate average confidence from LINE blocks only
    const confidence = lineBlocks.length > 0
      ? lineBlocks.reduce((sum, block) => sum + (block.Confidence || 0), 0) / lineBlocks.length / 100
      : 0; // Convert from percentage (0-100) to decimal (0-1)

    const success = textBlocks.trim().length > 0 && confidence > 0.5;

    // Track metrics
    trackOCRMetrics({
      source: 'textract',
      success,
      confidence,
      latency
    });

    logger.debug(`Textract extracted text: ${textBlocks.substring(0, 100)}... (confidence: ${confidence.toFixed(2)})`);

    return {
      text: textBlocks.trim(),
      confidence,
      source: 'textract',
      success
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    
    // Track failure metrics
    trackOCRMetrics({
      source: 'textract',
      success: false,
      confidence: 0,
      latency,
      error: error.message
    });

    logger.warn('Textract extraction failed:', error.message);
    return {
      text: '',
      confidence: 0,
      source: 'textract',
      success: false,
      error: error.message
    };
  }
}

/**
 * Extract text from image using OpenAI Vision API
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<Object>} Extraction result
 */
export async function extractTextWithVision(imageBuffer) {
  const startTime = Date.now();
  try {
    // Convert buffer to base64
    const base64Image = imageBuffer.toString('base64');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Updated from deprecated 'gpt-4-vision-preview'
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract the math problem or equation from this image. Return only the mathematical content, nothing else.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 500
    });

    const latency = Date.now() - startTime;
    const text = response.choices[0]?.message?.content?.trim() || '';
    const success = text.length > 0;

    // Track metrics
    trackOCRMetrics({
      source: 'vision',
      success,
      confidence: 0.9, // Vision API is generally reliable
      latency
    });

    logger.debug(`Vision extracted text: ${text.substring(0, 100)}...`);

    return {
      text,
      confidence: 0.9,
      source: 'vision',
      success
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    
    // Track failure metrics
    trackOCRMetrics({
      source: 'vision',
      success: false,
      confidence: 0,
      latency,
      error: error.message
    });

    logger.error('Vision extraction failed:', error);
    throw new OpenAIError('Failed to extract text using Vision API', error);
  }
}

/**
 * OCR pipeline: Try Textract first, fallback to Vision
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<Object>} Extraction result with best available text
 */
export async function extractTextFromImage(imageBuffer) {
  const pipelineStartTime = Date.now();
  
  // Try Textract first (cheaper, faster)
  logger.info('Attempting Textract extraction...');
  const textractResult = await extractTextWithTextract(imageBuffer);

  // Determine if we should use Textract result or fallback
  // Fallback if: low confidence, failed, or text looks invalid (too short, single character)
  const shouldFallback = 
    !textractResult.success || 
    textractResult.confidence < 0.7 || 
    textractResult.text.trim().length < 2 || // Too short to be meaningful
    /^[A-Za-z]$/.test(textractResult.text.trim()); // Single letter (likely misread)

  // If Textract succeeded with good confidence and valid text, use it
  if (!shouldFallback) {
    logger.info('Textract extraction successful');
    const totalLatency = Date.now() - pipelineStartTime;
    trackPipelineMetrics(textractResult, totalLatency);
    return textractResult;
  }

  // Fallback to Vision API
  logger.info(`Textract ${textractResult.success ? 'low confidence' : 'failed'}, trying Vision API...`, {
    textract_confidence: textractResult.confidence,
    textract_text: textractResult.text.substring(0, 50)
  });
  trackFallback();
  
  try {
    const visionResult = await extractTextWithVision(imageBuffer);
    logger.info('Vision extraction successful');
    const totalLatency = Date.now() - pipelineStartTime;
    trackPipelineMetrics(visionResult, totalLatency);
    return visionResult;
  } catch (error) {
    // If Vision also fails, return Textract result (even if empty/poor quality)
    logger.error('Both Textract and Vision failed, returning Textract result');
    const totalLatency = Date.now() - pipelineStartTime;
    const finalResult = {
      ...textractResult,
      fallback_failed: true,
      vision_error: error.message
    };
    trackPipelineMetrics(finalResult, totalLatency);
    return finalResult;
  }
}

