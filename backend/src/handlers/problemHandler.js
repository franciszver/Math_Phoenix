/**
 * Problem Submission Handler
 * Handles text and image problem submissions
 */

import { createSession, getSession, addProblemToSession, addToTranscript, updateSession } from '../services/sessionService.js';
import { uploadImageToS3, extractTextFromImage } from '../services/imageService.js';
import { processProblem } from '../services/problemService.js';
import { generateInitialPrompt } from '../services/socraticEngine.js';
import { collectMLData } from '../services/mlDataService.js';
import { createLogger } from '../utils/logger.js';
import { ValidationError } from '../utils/errorHandler.js';
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

    // Get or create session
    // Use code from URL params if available, otherwise from body
    let sessionCode = code || session_code;
    let session;

    if (sessionCode) {
      // Validate session code
      if (!validateSessionCode(sessionCode)) {
        throw new ValidationError('Invalid session code format', 'session_code');
      }

      try {
        session = await getSession(sessionCode);
      } catch (error) {
        // Session doesn't exist, create new one with same code
        // (though typically we'd create a new one with a new code)
        session = await createSession(sessionCode);
        sessionCode = session.session_code;
      }
    } else {
      // No session code provided, create new session
      session = await createSession();
      sessionCode = session.session_code;
    }

    // Validate input
    if (!text && !imageFile) {
      throw new ValidationError('Either text or image file must be provided', 'input');
    }

    let rawProblemText = text?.trim() || '';

    // If image provided, process it
    let imageUrl = null;
    let imageKey = null;
    let ocrResult = null;
    if (imageFile) {
      try {
        // Upload to S3 (always store for debugging)
        const uploadResult = await uploadImageToS3(imageFile.buffer, imageFile.originalname);
        imageUrl = uploadResult.url;
        imageKey = uploadResult.key;

        // Extract text from image
        ocrResult = await extractTextFromImage(imageFile.buffer);

        if (ocrResult.success && ocrResult.text) {
          rawProblemText = ocrResult.text;
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
        // Even if processing fails, image is stored
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

    // Process problem (normalize, categorize, classify difficulty)
    const processedProblem = await processProblem(rawProblemText);

    // Add image info if available
    if (imageUrl) {
      processedProblem.image_url = imageUrl;
      processedProblem.image_key = imageKey;
    }

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
      }
    });
  } catch (error) {
    next(error);
  }
}

