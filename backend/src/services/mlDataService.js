/**
 * ML Data Collection Service
 * Collects structured data for future ML difficulty classifier training
 */

import '../config/env.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

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

  // No persistent ML data table in the in-memory demo mode
  logger.debug('ML data collection skipped (in-memory demo mode)');

  return mlDataRecord;
}

/**
 * Check if ML data table exists (for validation)
 * Note: This is a simple check, actual table creation should be done via infrastructure scripts
 */
export async function validateMLDataTable() {
  logger.debug('ML data table validation skipped (in-memory demo mode)');
  return true;
}

