/**
 * Problem Submission Handler
 * Handles text and image problem submissions
 */

import { getSession, addProblemToSession, addToTranscript, updateSession } from '../services/sessionService.js';
import { extractTextFromImage, detectMultipleProblems, detectAndExtractWordProblem } from '../services/imageService.js';
import { processProblem, detectMultipleProblems as detectMultipleProblemsText, hasMathProblem, validateMultipleProblems, validateProblem } from '../services/problemService.js';
import { generateInitialPrompt } from '../services/socraticEngine.js';
import { collectMLData } from '../services/mlDataService.js';
import { createLogger } from '../utils/logger.js';
import { ValidationError, NotFoundError } from '../utils/errorHandler.js';
import { validateSessionCode } from '../utils/sessionCode.js';

const logger = createLogger();

/**
 * POST /api/sessions/:code/problems
 * Submit a new problem (text or image)
 */
export async function submitProblemHandler(req, res, next) {
  try {
    const { code } = req.params;
    const { text, session_code } = req.body;
    const imageFile = req.file;

    // Require an existing session. Unauthenticated callers must not be able
    // to trigger session creation (and the OCR/LLM chain below) by POSTing
    // to this route with an unknown/missing session code.
    let sessionCode = code || session_code;

    if (!sessionCode) {
      throw new NotFoundError('Session');
    }

    if (!validateSessionCode(sessionCode)) {
      throw new ValidationError('Invalid session code format', 'session_code');
    }

    // Throws NotFoundError if the session doesn't exist - propagated via
    // next(error) below, before any OCR/LLM work happens.
    await getSession(sessionCode);

    // Validate input
    if (!text && !imageFile) {
      throw new ValidationError('Either text or image file must be provided', 'input');
    }

    let rawProblemText = text?.trim() || '';
    let isWordProblem = false;
    let extractedWordProblemText = null;

    // If image provided, process it
    // Note: images are no longer stored (vision OCR is used directly on the
    // upload buffer), so image_url/image_key are always null in responses.
    const imageUrl = null;
    const imageKey = null;
    let ocrResult = null;
    if (imageFile) {
      try {
        // Extract text from image
        ocrResult = await extractTextFromImage(imageFile.buffer);

        // Check if image contains no math problem FIRST (before checking success)
        if (ocrResult.noMathProblem) {
          return res.status(400).json({
            error: 'no_math_problem',
            message: 'This image doesn\'t appear to contain a math problem. Please upload an image with a math problem or type it manually.',
            fallback: {
              type: 'manual_input',
              session_code: sessionCode,
              image_url: imageUrl
            }
          });
        }

        if (ocrResult.success && ocrResult.text) {
          // Check if this is a word problem and extract the full text
          const wordProblemCheck = await detectAndExtractWordProblem(ocrResult.text);
          
          if (wordProblemCheck.isWordProblem) {
            // This is a word problem - use the extracted full text
            logger.info('Detected word problem from image, using full narrative text');
            isWordProblem = true;
            extractedWordProblemText = wordProblemCheck.text;
            rawProblemText = wordProblemCheck.text;
            // Treat as text input going forward (no need for special image processing)
          } else {
            // Regular math problem - use OCR text as-is
            rawProblemText = ocrResult.text;
          }
        } else {
          // Both OCR and Vision failed - return error with manual fallback option
          return res.status(400).json({
            error: 'image_processing_failed',
            message: 'I couldn\'t read the problem from the image. Please type it out or try a clearer photo.',
            fallback: {
              type: 'manual_input',
              session_code: sessionCode,
              image_url: imageUrl
            }
          });
        }
      } catch (error) {
        logger.error('Error processing image:', error);
        return res.status(400).json({
          error: 'image_processing_error',
          message: 'Error processing image. Please try again or type the problem manually.',
          fallback: {
            type: 'manual_input',
            session_code: sessionCode,
            image_url: imageUrl
          }
        });
      }
    }

    if (!rawProblemText || rawProblemText.trim().length === 0) {
      throw new ValidationError('Problem text cannot be empty', 'input');
    }

    // Check if text contains a math problem (for text input)
    if (!imageFile) {
      const mathCheck = await hasMathProblem(rawProblemText);
      if (!mathCheck.hasMath) {
        return res.status(400).json({
          error: 'no_math_problem',
          message: 'This doesn\'t appear to be a math problem. Please provide a valid math problem.',
          fallback: {
            type: 'manual_input',
            session_code: sessionCode
          }
        });
      }
    }

    // Detect multiple problems
    let problemDetection;
    if (imageFile) {
      // For images, use the detectMultipleProblems from imageService
      problemDetection = await detectMultipleProblems(rawProblemText);
    } else {
      // For text input, use the problemService version
      problemDetection = await detectMultipleProblemsText(rawProblemText);
    }

    // If multiple problems detected, validate them and return selection UI
    if (problemDetection.isMultiple && problemDetection.problems.length >= 2) {
      const validation = await validateMultipleProblems(problemDetection.problems);
      
      // If all problems are invalid, return error
      if (validation.validProblems.length === 0) {
        return res.status(400).json({
          error: 'invalid_problems',
          message: 'The extracted problems don\'t appear to be valid math problems. Please try typing the problem manually.',
          invalidProblems: validation.invalidProblems,
          fallback: {
            type: 'manual_input',
            session_code: sessionCode,
            image_url: imageUrl || null
          }
        });
      }

      // Return multiple problems for user selection
      return res.status(200).json({
        multiple_problems: true,
        problems: validation.validProblems,
        invalidProblems: validation.invalidProblems.length > 0 ? validation.invalidProblems : undefined,
        image_url: imageUrl || null,
        image_key: imageKey || null,
        session_code: sessionCode
      });
    }

    // Single problem - validate it
    const singleProblemText = problemDetection.problems[0] || rawProblemText;
    const singleValidation = await validateProblem(singleProblemText);
    
    if (!singleValidation.valid) {
      return res.status(400).json({
        error: 'invalid_problem',
        message: singleValidation.reason || 'This doesn\'t appear to be a valid, complete math problem.',
        fallback: {
          type: 'manual_input',
          session_code: sessionCode,
          image_url: imageUrl || null
        }
      });
    }

    // Process problem (normalize, categorize, classify difficulty)
    const processedProblem = await processProblem(singleProblemText);
    // Note: image_url/image_key are never set here since images are no
    // longer stored (see comment above); processedProblem.image_url stays
    // undefined, which callers below already treat as null.

    // Add problem to session
    const updatedSession = await addProblemToSession(sessionCode, processedProblem);

    // Get current problem
    const currentProblem = updatedSession.problems.find(
      p => p.problem_id === updatedSession.current_problem_id
    );

    // Generate initial tutor prompt
    const tutorPrompt = await generateInitialPrompt(currentProblem);

    // Add to transcript
    await addToTranscript(sessionCode, 'student', rawProblemText);
    await addToTranscript(sessionCode, 'tutor', tutorPrompt);

    // Add initial step directly to the problem (avoid race condition with DynamoDB eventual consistency)
    const initialStep = {
      tutor_prompt: tutorPrompt,
      student_response: null,
      hint_used: false,
      progress_made: false,
      step_number: 1,
      timestamp: new Date().toISOString()
    };

    try {
      // Add step directly to the current problem we already have
      currentProblem.steps = currentProblem.steps || [];
      currentProblem.steps.push(initialStep);
      
      // Update the session with the step added
      const updatedProblems = updatedSession.problems.map(p => 
        p.problem_id === updatedSession.current_problem_id ? currentProblem : p
      );
      
      await updateSession(sessionCode, {
        problems: updatedProblems
      });
    } catch (stepError) {
      logger.error('Error adding initial step, but problem was created:', {
        error: stepError.message,
        error_name: stepError.name,
        session_code: sessionCode,
        problem_id: currentProblem.problem_id
      });
      // Continue anyway - problem and transcript are already created
      // The step can be added later or this is just the initial prompt
    }

    // Collect ML training data (non-blocking, async)
    collectMLData(currentProblem, updatedSession, ocrResult, false)
      .catch(error => {
        logger.warn('ML data collection failed (non-critical):', error);
      });

    res.status(201).json({
      session_code: sessionCode,
      problem_id: currentProblem.problem_id,
      tutor_message: tutorPrompt,
      conversation_context: {
        step_number: 1,
        hints_used: 0,
        progress_made: false
      },
      problem_info: {
        category: currentProblem.category,
        difficulty: currentProblem.difficulty,
        normalized_latex: currentProblem.normalized_latex,
        image_url: currentProblem.image_url || null
      },
      is_word_problem: isWordProblem || false,
      word_problem_text: extractedWordProblemText || null
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/sessions/:code/problems/select
 * Select and process a problem from multiple detected problems
 */
export async function selectProblemHandler(req, res, next) {
  try {
    const { code } = req.params;
    const { problemText, imageKey } = req.body;

    if (!validateSessionCode(code)) {
      throw new ValidationError('Invalid session code format', 'session_code');
    }

    if (!problemText || problemText.trim().length === 0) {
      throw new ValidationError('Problem text is required', 'problemText');
    }

    // Get session
    const session = await getSession(code);

    // Validate the selected problem
    const validation = await validateProblem(problemText.trim());
    if (!validation.valid) {
      return res.status(400).json({
        error: 'invalid_problem',
        message: validation.reason || 'The selected problem is not valid.',
        fallback: {
          type: 'manual_input',
          session_code: code
        }
      });
    }

    // Process the selected problem
    const processedProblem = await processProblem(problemText.trim());

    // Add image info if available
    if (imageKey) {
      processedProblem.image_url = null;
      processedProblem.image_key = imageKey;
    }

    // Add problem to session
    const updatedSession = await addProblemToSession(code, processedProblem);

    // Get current problem
    const currentProblem = updatedSession.problems.find(
      p => p.problem_id === updatedSession.current_problem_id
    );

    // Generate initial tutor prompt
    const tutorPrompt = await generateInitialPrompt(currentProblem);

    // Add to transcript
    await addToTranscript(code, 'student', problemText.trim());
    await addToTranscript(code, 'tutor', tutorPrompt);

    // Add initial step
    const initialStep = {
      tutor_prompt: tutorPrompt,
      student_response: null,
      hint_used: false,
      progress_made: false,
      step_number: 1,
      timestamp: new Date().toISOString()
    };

    try {
      currentProblem.steps = currentProblem.steps || [];
      currentProblem.steps.push(initialStep);
      
      const updatedProblems = updatedSession.problems.map(p => 
        p.problem_id === updatedSession.current_problem_id ? currentProblem : p
      );
      
      await updateSession(code, {
        problems: updatedProblems
      });
    } catch (stepError) {
      logger.error('Error adding initial step:', stepError);
    }

    res.status(201).json({
      session_code: code,
      problem_id: currentProblem.problem_id,
      tutor_message: tutorPrompt,
      conversation_context: {
        step_number: 1,
        hints_used: 0,
        progress_made: false
      },
      problem_info: {
        category: currentProblem.category,
        difficulty: currentProblem.difficulty,
        normalized_latex: currentProblem.normalized_latex,
        image_url: currentProblem.image_url || null
      }
    });
  } catch (error) {
    next(error);
  }
}

