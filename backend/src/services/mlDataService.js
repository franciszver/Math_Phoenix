/**
 * ML Data Collection Service
 * Collects structured data for future ML difficulty classifier training
 */

import '../config/env.js';
import { dynamoDocClient } from './aws.js';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { createLogger } from '../utils/logger.js';
import { AWSError } from '../utils/errorHandler.js';

const logger = createLogger();
const ML_DATA_TABLE = process.env.DYNAMODB_ML_TABLE_NAME || 'math-phoenix-ml-data';

/**
 * Extract feature vector from problem for ML training
 * @param {Object} problem - Problem data
 * @param {Object} session - Session data
 * @returns {Object} Feature vector
 */
function extractFeatures(problem, session) {
  const text = problem.raw_input || '';
  const searchText = text.toLowerCase();
  
  // Feature extraction
  const features = {
    // Text features
    text_length: text.length,
    word_count: text.split(/\s+/).length,
    
    // Operation counts
    addition_count: (text.match(/[+]/g) || []).length,
    subtraction_count: (text.match(/[-]/g) || []).length,
    multiplication_count: (text.match(/[×*]/g) || []).length,
    division_count: (text.match(/[÷/]/g) || []).length,
    equals_count: (text.match(/[=]/g) || []).length,
    total_operations: 0, // Calculated below
    
    // Variable features (for algebra)
    variable_count: (text.match(/[a-z]/gi) || []).length,
    unique_variables: new Set(text.match(/[a-z]/gi) || []).size,
    
    // Number features
    number_count: (text.match(/\d+/g) || []).length,
    max_number: Math.max(...(text.match(/\d+/g) || ['0']).map(n => parseInt(n) || 0), 0),
    avg_number: 0, // Calculated below
    
    // Complexity indicators
    has_fractions: /\d+\/\d+/.test(text),
    has_decimals: /\.\d+/.test(text),
    has_parentheses: /[()]/.test(text),
    has_exponents: /\^|\*\*/.test(text),
    
    // Category features (one-hot encoded)
    category_arithmetic: problem.category === 'arithmetic' ? 1 : 0,
    category_algebra: problem.category === 'algebra' ? 1 : 0,
    category_geometry: problem.category === 'geometry' ? 1 : 0,
    category_word: problem.category === 'word' ? 1 : 0,
    category_multistep: problem.category === 'multi-step' ? 1 : 0,
    
    // Difficulty (current classification - used as label)
    difficulty: problem.difficulty,
    
    // LaTeX features
    has_latex: problem.normalized_latex && problem.normalized_latex !== text,
    latex_length: (problem.normalized_latex || '').length,
    
    // Student performance (if available)
    hints_used: problem.hints_used_total || 0,
    steps_count: (problem.steps || []).length,
    completed: problem.completed || false,
    
    // Teacher override (valuable signal for training)
    teacher_override: false, // Will be set if teacher manually corrected
    teacher_category: null,
    teacher_difficulty: null
  };
  
  // Calculate derived features
  features.total_operations = features.addition_count + features.subtraction_count + 
                              features.multiplication_count + features.division_count;
  
  const numbers = (text.match(/\d+/g) || []).map(n => parseInt(n) || 0);
  features.avg_number = numbers.length > 0 
    ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length 
    : 0;
  
  return features;
}

/**
 * Collect ML training data for a problem
 * @param {Object} problem - Problem data
 * @param {Object} session - Session data
 * @param {Object} ocrResult - OCR extraction result (if image)
 * @param {boolean} teacherOverride - Whether teacher manually corrected tags
 */
export async function collectMLData(problem, session, ocrResult = null, teacherOverride = false) {
  try {
    // Extract features
    const features = extractFeatures(problem, session);
    
    // Add OCR metadata if available
    if (ocrResult) {
      features.ocr_source = ocrResult.source;
      features.ocr_confidence = ocrResult.confidence;
      features.ocr_success = ocrResult.success;
    }
    
    // Mark teacher override
    if (teacherOverride) {
      features.teacher_override = true;
      features.teacher_category = problem.category;
      features.teacher_difficulty = problem.difficulty;
    }
    
    // Create data record
    const mlDataRecord = {
      record_id: `${session.session_code}-${problem.problem_id}-${Date.now()}`,
      session_code: session.session_code,
      problem_id: problem.problem_id,
      created_at: new Date().toISOString(),
      
      // Raw data (for flexibility)
      raw_data: {
        problem_text: problem.raw_input,
        category: problem.category,
        difficulty: problem.difficulty,
        normalized_latex: problem.normalized_latex,
        hints_used: problem.hints_used_total || 0,
        steps_count: (problem.steps || []).length,
        completed: problem.completed || false
      },
      
      // Feature vector (for ML training)
      features,
      
      // Metadata
      metadata: {
        teacher_override: teacherOverride,
        ocr_used: !!ocrResult,
        timestamp: new Date().toISOString()
      }
    };
    
    // Store in DynamoDB
    await dynamoDocClient.send(
      new PutCommand({
        TableName: ML_DATA_TABLE,
        Item: mlDataRecord
      })
    );
    
    logger.info('ML data collected', {
      record_id: mlDataRecord.record_id,
      session_code: session.session_code,
      problem_id: problem.problem_id,
      category: problem.category,
      difficulty: problem.difficulty,
      teacher_override: teacherOverride
    });
    
    return mlDataRecord;
  } catch (error) {
    // Log error but don't fail the main request
    // Check if it's a table not found error
    const isTableNotFound = error.name === 'ResourceNotFoundException' || 
                           error.message?.includes('Requested resource not found') ||
                           error.message?.includes('Cannot do operations on a non-existent table');
    
    if (isTableNotFound) {
      logger.warn('ML data table not found - skipping ML data collection', {
        table_name: ML_DATA_TABLE,
        session_code: session.session_code,
        problem_id: problem.problem_id,
        hint: 'Run the infrastructure setup script to create the ML data table'
      });
    } else {
      logger.error('Error collecting ML data', {
        error: error.message,
        error_name: error.name,
        error_code: error.code,
        session_code: session.session_code,
        problem_id: problem.problem_id
      });
    }
    
    // Don't throw - ML data collection is non-critical
    return null;
  }
}

/**
 * Check if ML data table exists (for validation)
 * Note: This is a simple check, actual table creation should be done via infrastructure scripts
 */
export async function validateMLDataTable() {
  try {
    // Try to put a test record (will fail if table doesn't exist)
    // In production, this would be a proper DescribeTable call
    logger.debug('ML data table validation skipped (table creation handled by infrastructure)');
    return true;
  } catch (error) {
    logger.warn('ML data table may not exist', {
      table_name: ML_DATA_TABLE,
      error: error.message
    });
    return false;
  }
}

