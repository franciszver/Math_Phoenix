/**
 * Problem Processing Service
 * Handles LaTeX normalization, category tagging, and difficulty classification
 */

import '../config/env.js';
import { openai } from './openai.js';
import { createLogger } from '../utils/logger.js';
import { OpenAIError } from '../utils/errorHandler.js';

const logger = createLogger();

/**
 * Normalize math problem to LaTeX using LLM
 * @param {string} rawText - Raw text from OCR or user input
 * @returns {Promise<string>} LaTeX normalized equation
 */
export async function normalizeToLaTeX(rawText) {
  if (!rawText || rawText.trim().length === 0) {
    return rawText.trim();
  }

  try {
    const prompt = `Convert this math problem or equation to LaTeX format. Keep the meaning identical. Return only the LaTeX code, nothing else.

Problem: "${rawText}"

LaTeX:`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a math notation converter. Convert mathematical expressions to LaTeX format accurately and concisely.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 200,
      temperature: 0.3
    });

    const latex = response.choices[0]?.message?.content?.trim() || rawText;
    
    // Clean up common LLM artifacts
    const cleanedLatex = latex
      .replace(/^```latex\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    logger.debug(`Normalized to LaTeX: ${rawText.substring(0, 50)}... → ${cleanedLatex.substring(0, 50)}...`);
    
    return cleanedLatex || rawText; // Fallback to original if empty
  } catch (error) {
    logger.error('Error normalizing to LaTeX:', error);
    // Fallback to original text if LLM fails
    return rawText;
  }
}

/**
 * Categorize problem using rule-based classification
 * @param {string} text - Problem text
 * @param {string} latex - LaTeX normalized version
 * @returns {string} Category: arithmetic, algebra, geometry, word, multi-step
 */
export function categorizeProblem(text, latex) {
  const searchText = `${text} ${latex}`.toLowerCase();

  // Arithmetic: simple numbers, basic operations
  const arithmeticPatterns = [
    /\d+\s*[+\-×*÷\/]\s*\d+/,
    /\b(multiply|divide|add|subtract|plus|minus)\b/,
    /fraction|percentage|decimal/i,
    /\b\d+\s*(times|divided by)\s*\d+\b/
  ];
  if (arithmeticPatterns.some(pattern => pattern.test(searchText))) {
    return 'arithmetic';
  }

  // Algebra: variables, equations
  const algebraPatterns = [
    /[a-z]\s*[=+\-×*÷\/]/,
    /solve for|find [a-z]|variable|equation/i,
    /\b(2x|3y|4z|5a|6b)\b/,
    /\b(linear|quadratic|polynomial)\b/i
  ];
  if (algebraPatterns.some(pattern => pattern.test(searchText))) {
    return 'algebra';
  }

  // Geometry: shapes, angles, area, perimeter
  const geometryPatterns = [
    /\b(triangle|circle|square|rectangle|area|perimeter|angle|radius|diameter)\b/i,
    /\b(degrees?|°|cm\s*²|meters?)\b/i,
    /\b(pythagorean|hypotenuse|base|height)\b/i
  ];
  if (geometryPatterns.some(pattern => pattern.test(searchText))) {
    return 'geometry';
  }

  // Word problems: story-like, real-world context
  const wordProblemPatterns = [
    /\b(has|have|bought|sold|spent|earned|left|remaining|total|altogether)\b/i,
    /\b(how many|how much|how long|how far)\b/i,
    /\b(if|when|then|after|before)\b.*\b(how)\b/i,
    /\d+\s*(years?|months?|days?|hours?|minutes?|dollars?|cents?)/i
  ];
  if (wordProblemPatterns.some(pattern => pattern.test(searchText))) {
    // Check if it's also multi-step
    const steps = (searchText.match(/\b(and|then|also|next|finally)\b/gi) || []).length;
    return steps >= 2 ? 'multi-step' : 'word';
  }

  // Multi-step: multiple operations, sequential reasoning
  const multiStepPatterns = [
    /\b(first|then|next|finally|step 1|step 2)\b/i,
    /\b(and then|after that|also|in addition)\b/i,
    /[+\-×*÷\/].*[+\-×*÷\/]/ // Multiple operations
  ];
  if (multiStepPatterns.some(pattern => pattern.test(searchText))) {
    return 'multi-step';
  }

  // Default to arithmetic if unclear
  return 'arithmetic';
}

/**
 * Classify difficulty using rule-based approach
 * @param {string} text - Problem text
 * @param {string} category - Problem category
 * @returns {string} Difficulty: very_easy, easy, medium, hard, very_hard
 */
export function classifyDifficulty(text, category) {
  const searchText = text.toLowerCase();
  
  // Count complexity indicators
  let complexityScore = 0;

  // Operations count
  const operations = (searchText.match(/[+\-×*÷\/=]/g) || []).length;
  complexityScore += operations * 2;

  // Variable count (for algebra)
  if (category === 'algebra') {
    const variables = (searchText.match(/[a-z]/g) || []).length;
    complexityScore += variables * 3;
  }

  // Number size (larger numbers = harder)
  const numbers = searchText.match(/\d+/g) || [];
  const maxNumber = Math.max(...numbers.map(n => parseInt(n) || 0));
  if (maxNumber > 1000) complexityScore += 3;
  else if (maxNumber > 100) complexityScore += 2;
  else if (maxNumber > 10) complexityScore += 1;

  // Multi-step indicators
  if (category === 'multi-step') {
    complexityScore += 5;
  }

  // Word problem complexity
  if (category === 'word') {
    const contextWords = (searchText.match(/\b(has|have|bought|sold|spent|earned)\b/gi) || []).length;
    complexityScore += contextWords * 2;
  }

  // Determine difficulty based on score
  if (complexityScore <= 3) return 'very_easy';
  if (complexityScore <= 6) return 'easy';
  if (complexityScore <= 10) return 'medium';
  if (complexityScore <= 15) return 'hard';
  return 'very_hard';
}

/**
 * Detect if text contains one or multiple math problems
 * @param {string} rawText - Raw text input
 * @returns {Promise<Object>} Detection result with problems array
 */
export async function detectMultipleProblems(rawText) {
  if (!rawText || rawText.trim().length === 0) {
    return { isMultiple: false, problems: [] };
  }

  try {
    const prompt = `Does this text contain one math problem or multiple separate math problems? If multiple, list them numbered.

Text: "${rawText}"

If there is only ONE problem, respond with: "SINGLE: [the problem text]"
If there are MULTIPLE problems, respond with each problem on a new line numbered: "MULTIPLE:\n1. [first problem]\n2. [second problem]\n..."`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a math problem parser. Identify if text contains one or multiple separate math problems.'
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
        logger.debug(`Detected ${problems.length} problems in text`);
        return { isMultiple: true, problems };
      }
    } else if (responseText.startsWith('SINGLE:')) {
      // Single problem, extract it
      const singleProblem = responseText.replace('SINGLE:', '').trim();
      return { isMultiple: false, problems: [singleProblem] };
    }

    // Fallback: treat as single problem
    return { isMultiple: false, problems: [rawText] };
  } catch (error) {
    logger.error('Error detecting multiple problems:', error);
    // Fallback to single problem on error
    return { isMultiple: false, problems: [rawText] };
  }
}

/**
 * Check if text contains a math problem
 * @param {string} text - Text to check
 * @returns {Promise<Object>} Result with hasMath boolean
 */
export async function hasMathProblem(text) {
  if (!text || text.trim().length === 0) {
    return { hasMath: false };
  }

  try {
    const prompt = `Does this text contain a math problem? Respond with only "YES" or "NO".

Text: "${text}"`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a math problem detector. Determine if text contains a math problem.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 10,
      temperature: 0.1
    });

    const responseText = response.choices[0]?.message?.content?.trim().toUpperCase() || '';
    const hasMath = responseText === 'YES';
    
    logger.debug(`Math problem check: ${hasMath ? 'YES' : 'NO'}`);
    return { hasMath };
  } catch (error) {
    logger.error('Error checking for math problem:', error);
    // Fallback: assume it has math if text is not empty
    return { hasMath: text.trim().length > 0 };
  }
}

/**
 * Validate if a problem text is valid and complete
 * @param {string} text - Problem text to validate
 * @returns {Promise<Object>} Validation result
 */
export async function validateProblem(text) {
  if (!text || text.trim().length === 0) {
    return { valid: false, reason: 'Problem text is empty' };
  }

  try {
    const prompt = `Is this a valid, complete math problem? Respond with "VALID" or "INVALID" followed by a brief reason.

Problem: "${text}"`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a math problem validator. Determine if text is a valid, complete, solvable math problem.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 100,
      temperature: 0.2
    });

    const responseText = response.choices[0]?.message?.content?.trim() || '';
    const valid = responseText.toUpperCase().startsWith('VALID');
    
    // Extract reason if invalid
    let reason = null;
    if (!valid) {
      const reasonMatch = responseText.match(/INVALID\s*:?\s*(.+)/i);
      reason = reasonMatch ? reasonMatch[1].trim() : 'Problem is not valid or complete';
    }
    
    logger.debug(`Problem validation: ${valid ? 'VALID' : 'INVALID'} - ${reason || 'N/A'}`);
    return { valid, reason };
  } catch (error) {
    logger.error('Error validating problem:', error);
    // Fallback: assume valid if we can't validate
    return { valid: true };
  }
}

/**
 * Validate multiple problems
 * @param {string[]} problems - Array of problem texts
 * @returns {Promise<Object>} Validation result with valid and invalid problems
 */
export async function validateMultipleProblems(problems) {
  if (!problems || problems.length === 0) {
    return { validProblems: [], invalidProblems: [] };
  }

  const validProblems = [];
  const invalidProblems = [];

  // Validate each problem
  for (const problemText of problems) {
    const validation = await validateProblem(problemText);
    if (validation.valid) {
      validProblems.push(problemText);
    } else {
      invalidProblems.push({
        text: problemText,
        reason: validation.reason || 'Invalid problem'
      });
    }
  }

  logger.info(`Validated ${problems.length} problems: ${validProblems.length} valid, ${invalidProblems.length} invalid`);
  return { validProblems, invalidProblems };
}

/**
 * Process a problem: normalize, categorize, and classify difficulty
 * @param {string} rawText - Raw problem text
 * @returns {Promise<Object>} Processed problem data
 */
export async function processProblem(rawText) {
  if (!rawText || rawText.trim().length === 0) {
    throw new Error('Problem text cannot be empty');
  }

  // Normalize to LaTeX
  const normalizedLatex = await normalizeToLaTeX(rawText);

  // Categorize
  const category = categorizeProblem(rawText, normalizedLatex);

  // Classify difficulty
  const difficulty = classifyDifficulty(rawText, category);

  logger.info(`Processed problem: category=${category}, difficulty=${difficulty}`);

  return {
    raw_input: rawText,
    normalized_latex: normalizedLatex,
    category,
    difficulty
  };
}

