/**
 * Image Processing Service
 * Handles S3 upload and OCR pipeline (Textract → Vision fallback)
 */

import '../config/env.js';
import { s3Client, textractClient } from './aws.js';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
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
              text: 'Extract all math problems from this image. If there is only one problem, return it. If there are multiple problems, return them numbered (1, 2, 3...), one per line. If this image does NOT contain a math problem, respond with "NO_MATH_PROBLEM". Return only the mathematical content, nothing else.'
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
      max_tokens: 1000
    });

    const latency = Date.now() - startTime;
    const text = response.choices[0]?.message?.content?.trim() || '';
    
    // Check if image contains no math problem
    if (text.toUpperCase().includes('NO_MATH_PROBLEM') || text.length === 0) {
      logger.debug('Vision detected no math problem in image');
      return {
        text: '',
        confidence: 0.9,
        source: 'vision',
        success: false,
        noMathProblem: true,
        reason: 'Image does not contain a math problem'
      };
    }

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
 * Download image from S3
 * @param {string} imageKey - S3 object key
 * @returns {Promise<Buffer|null>} Image buffer or null if download fails
 */
export async function downloadImageFromS3(imageKey) {
  if (!imageKey) {
    logger.warn('No image key provided for download');
    return null;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: imageKey
    });

    const response = await s3Client.send(command);
    
    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    logger.debug(`Image downloaded from S3: ${imageKey} (${buffer.length} bytes)`);
    return buffer;
  } catch (error) {
    logger.error('Error downloading image from S3:', error);
    return null;
  }
}

/**
 * Verify problem text against image using Vision API
 * @param {Buffer} imageBuffer - Image buffer
 * @param {string} currentProblemText - Current problem text to verify
 * @returns {Promise<Object>} Verification result with matches, correctText, and confidence
 */
export async function verifyProblemTextAgainstImage(imageBuffer, currentProblemText) {
  const startTime = Date.now();
  
  if (!imageBuffer || !currentProblemText) {
    logger.warn('Missing image buffer or problem text for verification');
    return { matches: true, correctText: null, confidence: 0 };
  }

  try {
    // Convert buffer to base64
    const base64Image = imageBuffer.toString('base64');

    const prompt = `Does the text "${currentProblemText}" accurately represent what you see in this image? 

If the text matches exactly, respond with: "MATCHES"

If the text does NOT match, respond with ONLY the correct text from the image. Do not include any explanation, just the correct text.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
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
      max_tokens: 200,
      temperature: 0.1 // Low temperature for accurate verification
    });

    const latency = Date.now() - startTime;
    const responseText = response.choices[0]?.message?.content?.trim() || '';
    
    // Check if response indicates a match
    const matches = responseText.toUpperCase() === 'MATCHES' || 
                    responseText.toLowerCase() === 'matches' ||
                    (responseText.toLowerCase() === currentProblemText.toLowerCase());

    if (matches) {
      logger.debug(`Image verification: Text matches image (latency: ${latency}ms)`);
      return {
        matches: true,
        correctText: null,
        confidence: 0.9,
        latency
      };
    } else {
      // Response contains the correct text
      const correctText = responseText.trim();
      logger.info(`Image verification: Mismatch detected. Original: "${currentProblemText.substring(0, 50)}..." → Correct: "${correctText.substring(0, 50)}..."`);
      
      return {
        matches: false,
        correctText,
        confidence: 0.9,
        latency
      };
    }
  } catch (error) {
    const latency = Date.now() - startTime;
    logger.error('Error verifying problem text against image:', error);
    
    // Graceful degradation: return matches=true to avoid breaking conversation
    return {
      matches: true,
      correctText: null,
      confidence: 0,
      latency,
      error: error.message
    };
  }
}

/**
 * Detect and parse multiple problems from extracted text
 * @param {string} text - Extracted text from image
 * @returns {Promise<Object>} Parsed problems result
 */
export async function detectMultipleProblems(text) {
  if (!text || text.trim().length === 0) {
    return { isMultiple: false, problems: [] };
  }

  try {
    // First, try simple regex-based detection for numbered problems
    // Pattern: "1. problem text\n2. problem text" or similar
    const numberedPattern = /^\d+[\.\)]\s+.+$/m;
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    
    // Check if we have numbered lines (multiple problems)
    const numberedLines = lines.filter(line => numberedPattern.test(line.trim()));
    
    if (numberedLines.length >= 2) {
      // Extract numbered problems
      const problems = numberedLines.map(line => {
        // Remove leading number and punctuation
        return line.replace(/^\d+[\.\)]\s*/, '').trim();
      }).filter(p => p.length > 0);
      
      if (problems.length >= 2) {
        logger.debug(`Detected ${problems.length} numbered problems`);
        return { isMultiple: true, problems };
      }
    }

    // Use LLM to parse and split if regex didn't work
    const prompt = `Does this text contain one math problem or multiple separate math problems?
    
Text: "${text}"

If there is only ONE problem, respond with: "SINGLE: [the problem text]"
If there are MULTIPLE problems, respond with each problem on a new line numbered: "MULTIPLE:\n1. [first problem]\n2. [second problem]\n..."`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a math problem parser. Identify if text contains one or multiple math problems and format accordingly.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.3
    });

    const responseText = response.choices[0]?.message?.content?.trim() || '';
    
    if (responseText.startsWith('MULTIPLE:')) {
      // Extract problems from numbered list
      const problemLines = responseText
        .replace('MULTIPLE:', '')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && /^\d+[\.\)]\s+/.test(line));
      
      const problems = problemLines.map(line => {
        return line.replace(/^\d+[\.\)]\s*/, '').trim();
      }).filter(p => p.length > 0);
      
      if (problems.length >= 2) {
        logger.debug(`LLM detected ${problems.length} problems`);
        return { isMultiple: true, problems };
      }
    } else if (responseText.startsWith('SINGLE:')) {
      // Single problem, extract it
      const singleProblem = responseText.replace('SINGLE:', '').trim();
      return { isMultiple: false, problems: [singleProblem] };
    }

    // Fallback: treat as single problem
    return { isMultiple: false, problems: [text] };
  } catch (error) {
    logger.error('Error detecting multiple problems:', error);
    // Fallback to single problem on error
    return { isMultiple: false, problems: [text] };
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
    const totalLatency = Date.now() - pipelineStartTime;
    
    if (visionResult.noMathProblem) {
      logger.info('Vision detected: No math problem in image');
    } else {
      logger.info('Vision extraction successful');
    }
    
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

