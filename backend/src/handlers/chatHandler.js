/**
 * Chat API Handler
 * Handles conversation messages in Socratic dialogue
 */

import { getSession, addStepToProblem, addToTranscript, updateSession } from '../services/sessionService.js';
import { processStudentResponse, detectSolutionCompletion, generateTutorResponse } from '../services/socraticEngine.js';
import {
  extractApproachFromConversation,
  generateMCQuestions,
  evaluateMCAnswer,
  generateTransferProblem,
  calculateLearningConfidence,
  getAdaptiveRecommendation
} from '../services/learningAssessmentService.js';
import { downloadImageFromS3, verifyProblemTextAgainstImage } from '../services/imageService.js';
import { processProblem } from '../services/problemService.js';
import { openai } from '../services/openai.js';
import { createLogger } from '../utils/logger.js';
import { ValidationError, NotFoundError } from '../utils/errorHandler.js';
import { validateSessionCode } from '../utils/sessionCode.js';

const logger = createLogger();

/**
 * POST /api/sessions/:code/chat
 * Send a message in the conversation
 */
export async function sendChatMessageHandler(req, res, next) {
  try {
    const { code } = req.params;
    const { message, session_code, mc_answer, question_id, transfer_answer } = req.body;

    // Validate session code
    const sessionCode = code || session_code;
    if (!validateSessionCode(sessionCode)) {
      throw new ValidationError('Invalid session code format', 'session_code');
    }

    // Get session
    const session = await getSession(sessionCode);

    // Check if there's an active problem
    if (!session.current_problem_id) {
      throw new ValidationError('No active problem in this session. Please submit a problem first.', 'session');
    }

    // Get current problem
    const currentProblem = session.problems.find(
      p => p.problem_id === session.current_problem_id && !p.completed
    );

    if (!currentProblem) {
      throw new NotFoundError('Current problem');
    }

    // Handle MC answer submission
    if (mc_answer !== undefined && question_id) {
      return await handleMCAnswer(sessionCode, currentProblem, question_id, mc_answer, res, next);
    }

    // Handle transfer problem answer
    if (transfer_answer !== undefined) {
      return await handleTransferAnswer(sessionCode, currentProblem, transfer_answer, res, next);
    }

    // Validate regular message
    if (!message || message.trim().length === 0) {
      throw new ValidationError('Message cannot be empty', 'message');
    }

    // Get conversation steps
    const steps = currentProblem.steps || [];

    // Get current streak state BEFORE updating (to detect changes)
    const sessionBeforeUpdate = await getSession(sessionCode);
    const previousStreakProgress = sessionBeforeUpdate.streak_progress || 0;
    const previousStreakCompletions = sessionBeforeUpdate.streak_completions || 0;

    logger.debug(`[STREAK] chatHandler: BEFORE update`, {
      sessionCode,
      previousProgress: previousStreakProgress,
      previousCompletions: previousStreakCompletions
    });

    // Process student response
    const result = await processStudentResponse({
      studentResponse: message.trim(),
      problem: currentProblem,
      steps
    });

    logger.debug(`[STREAK] chatHandler: step created`, {
      hint_used: result.step.hint_used,
      progress_made: result.step.progress_made
    });

    // Image verification: Check if problem is image-based and needs verification
    let correctedResult = result;
    
    if (currentProblem.image_key && currentProblem.problem_id === session.current_problem_id) {
      // Check OCR confidence threshold (0.8 = 80%)
      const ocrConfidence = currentProblem.ocr_confidence;
      const shouldVerify = !ocrConfidence || ocrConfidence < 0.8 || ocrConfidence === 0;
      
      if (shouldVerify) {
        try {
          logger.debug(`[VERIFICATION] Starting verification for problem ${currentProblem.problem_id}, OCR confidence: ${ocrConfidence || 'missing'}`);
          
          // Download image from S3
          const imageBuffer = await downloadImageFromS3(currentProblem.image_key);
          
          if (imageBuffer) {
            // Verify problem text against image
            const verificationResult = await verifyProblemTextAgainstImage(
              imageBuffer,
              currentProblem.raw_input
            );
            
            if (!verificationResult.matches && verificationResult.correctText) {
              // Mismatch detected - correct the problem
              const originalText = currentProblem.raw_input;
              const correctedText = verificationResult.correctText;
              
              logger.info(`[VERIFICATION] Correction detected: "${originalText.substring(0, 50)}..." → "${correctedText.substring(0, 50)}..."`);
              
              // Update problem with corrected text
              currentProblem.raw_input = correctedText;
              
              // Re-process problem (updates LaTeX, category, difficulty)
              const reprocessedProblem = await processProblem(correctedText);
              currentProblem.normalized_latex = reprocessedProblem.normalized_latex;
              currentProblem.category = reprocessedProblem.category;
              currentProblem.difficulty = reprocessedProblem.difficulty;
              
              // Re-generate tutor response with correction context
              const correctedTutorResponse = await generateTutorResponse({
                problemText: correctedText,
                normalizedLatex: reprocessedProblem.normalized_latex,
                category: reprocessedProblem.category,
                studentResponse: message.trim(),
                conversationHistory: steps,
                shouldProvideHint: result.step.hint_used,
                correctionContext: {
                  originalText,
                  correctedText
                }
              });
              
              // Update result with corrected response
              correctedResult = {
                ...result,
                tutorMessage: correctedTutorResponse.message,
                step: {
                  ...result.step,
                  tutor_prompt: correctedTutorResponse.message
                }
              };
              
              // Update session with corrected problem
              const sessionForUpdate = await getSession(sessionCode);
              const updatedProblems = sessionForUpdate.problems.map(p =>
                p.problem_id === currentProblem.problem_id ? currentProblem : p
              );
              await updateSession(sessionCode, { problems: updatedProblems });
              
              logger.info(`[VERIFICATION] Problem corrected and response regenerated`);
            } else {
              logger.debug(`[VERIFICATION] Text matches image, no correction needed`);
            }
          } else {
            logger.warn(`[VERIFICATION] Failed to download image from S3, skipping verification`);
          }
        } catch (error) {
          // Graceful degradation: continue with original response
          logger.error(`[VERIFICATION] Error during verification:`, error);
        }
      } else {
        logger.debug(`[VERIFICATION] Skipping verification - high OCR confidence: ${ocrConfidence}`);
      }
    }

    // Add step to problem (use corrected result if verification found a mismatch)
    const updatedSession = await addStepToProblem(sessionCode, correctedResult.step);

    // Add to transcript (use corrected message if verification updated it)
    await addToTranscript(sessionCode, 'student', message.trim());
    await addToTranscript(sessionCode, 'tutor', correctedResult.tutorMessage);

    // Get updated problem and session
    const finalSession = await getSession(sessionCode);
    const updatedProblem = finalSession.problems.find(
      p => p.problem_id === finalSession.current_problem_id
    );

    logger.debug(`[STREAK] chatHandler: AFTER update`, {
      sessionCode,
      currentProgress: finalSession.streak_progress || 0,
      currentCompletions: finalSession.streak_completions || 0,
      streakCompleted: finalSession.streak_completed || false,
      progressChange: (finalSession.streak_progress || 0) - previousStreakProgress
    });

    // Check for solution completion
    const solutionCompletion = await detectSolutionCompletion(
      message.trim(),
      currentProblem,
      steps
    );

    // Check if assessment should be triggered
    let assessmentTriggered = false;
    let mcQuestions = null;

    if (solutionCompletion.solution_completed && solutionCompletion.is_correct) {
      // Check if assessment already completed
      if (!updatedProblem.learning_assessment || !updatedProblem.learning_assessment.assessment_completed) {
        // Extract approach and generate MC questions
        const approach = await extractApproachFromConversation(updatedProblem, updatedProblem.steps);
        mcQuestions = await generateMCQuestions(updatedProblem, approach, updatedProblem.steps);
        
        // Store initial assessment state
        const assessmentData = {
          approach_extracted: approach,
          mc_questions: mcQuestions,
          mc_score: null,
          transfer_success: null,
          learning_confidence: null,
          assessment_completed: false,
          assessed_at: new Date().toISOString()
        };

        updatedProblem.learning_assessment = assessmentData;
        await updateSession(sessionCode, {
          problems: finalSession.problems.map(p =>
            p.problem_id === updatedProblem.problem_id ? updatedProblem : p
          )
        });

        assessmentTriggered = true;
        logger.info(`[ASSESSMENT] MC quiz triggered: solution completed and correct`);
      }
    }

    // Get latest step number
    const stepNumber = updatedProblem.steps.length;

    // Detect streak changes for feedback
    const currentStreakProgress = finalSession.streak_progress || 0;
    const streakReset = previousStreakProgress > 0 && currentStreakProgress === 0 && result.step.hint_used;
    const streakCompleted = finalSession.streak_completed || false;

    let streakFeedback = null;
    if (streakReset) {
      streakFeedback = "Your streak was reset because you used a hint. Keep working without hints to build it back up! 💪";
    } else if (streakCompleted) {
      streakFeedback = "🎉 Amazing! You completed your streak! You're making great progress without hints!";
    } else if (currentStreakProgress > previousStreakProgress && currentStreakProgress > 0) {
      // Provide encouragement when streak increases (but not on completion)
      const progressPercent = currentStreakProgress;
      if (progressPercent === 20) {
        streakFeedback = "Great start! Your streak is building! 🌟";
      } else if (progressPercent === 40) {
        streakFeedback = "You're halfway there! Keep going! ⭐";
      } else if (progressPercent === 60) {
        streakFeedback = "You're doing great! Keep it up! 🔥";
      } else if (progressPercent === 80) {
        streakFeedback = "Almost there! One more step! 💫";
      }
    }

    const response = {
      session_code: sessionCode,
      tutor_message: correctedResult.tutorMessage,
      conversation_context: {
        step_number: stepNumber,
        hints_used: updatedProblem.hints_used_total || 0,
        progress_made: result.step.progress_made,
        stuck_turns: result.step.stuck_turns,
        solution_completed: solutionCompletion.solution_completed,
        is_correct: solutionCompletion.is_correct
      },
      streak: {
        progress: currentStreakProgress,
        completions: finalSession.streak_completions || 0,
        completed: streakCompleted,
        feedback: streakFeedback
      },
      problem_info: {
        problem_id: updatedProblem.problem_id,
        category: updatedProblem.category,
        difficulty: updatedProblem.difficulty,
        normalized_latex: updatedProblem.normalized_latex || null
      }
    };

    // Add assessment data if triggered
    if (assessmentTriggered && mcQuestions) {
      response.assessment = {
        triggered: true,
        mc_questions: mcQuestions,
        current_question_index: 0
      };
    }

    res.json(response);

    // Clear streak_completed flag after reading (one-time celebration)
    // Do this asynchronously to not block the response
    if (finalSession.streak_completed) {
      updateSession(sessionCode, { streak_completed: false }).catch(err => {
        logger.error('Error clearing streak_completed flag:', err);
      });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Handle MC answer submission
 */
async function handleMCAnswer(sessionCode, problem, questionId, selectedIndex, res, next) {
  try {
    if (!problem.learning_assessment || !problem.learning_assessment.mc_questions) {
      throw new ValidationError('No MC questions available', 'assessment');
    }

    const questions = problem.learning_assessment.mc_questions;
    const question = questions.find(q => q.question_id === questionId);
    
    if (!question) {
      throw new NotFoundError('MC question');
    }

    // Evaluate answer
    const updatedQuestion = evaluateMCAnswer(question, selectedIndex);
    
    // Update question in array
    const updatedQuestions = questions.map(q =>
      q.question_id === questionId ? updatedQuestion : q
    );

    // Calculate MC score
    const correctCount = updatedQuestions.filter(q => q.correct === true).length;
    const mcScore = updatedQuestions.length > 0 ? correctCount / updatedQuestions.length : 0;

    // Find current question index (next unanswered question)
    const currentIndex = updatedQuestions.findIndex(q => q.student_answer_index === null);
    const allAnswered = currentIndex === -1;
    
    logger.debug(`MC Answer: questionId=${questionId}, totalQuestions=${updatedQuestions.length}, currentIndex=${currentIndex}, allAnswered=${allAnswered}`);

    // Update assessment
    problem.learning_assessment.mc_questions = updatedQuestions;
    problem.learning_assessment.mc_score = mcScore;

    // Check if MC quiz is passed (>= 67% or 2/3 correct)
    const MC_PASS_THRESHOLD = 0.67;
    const mcQuizPassed = allAnswered && mcScore >= MC_PASS_THRESHOLD;
    const mcQuizFailed = allAnswered && mcScore < MC_PASS_THRESHOLD;

    // Transfer problem is no longer offered - we complete the problem after MC quiz regardless of pass/fail
    // This allows students to move on to a new problem
    let transferProblem = null;

    // Calculate learning confidence if all assessment done
    let learningConfidence = null;
    if (allAnswered && problem.learning_assessment.transfer_success !== null) {
      learningConfidence = calculateLearningConfidence(
        mcScore,
        problem.learning_assessment.transfer_success
      );
      problem.learning_assessment.learning_confidence = learningConfidence;
      problem.learning_assessment.assessment_completed = true;
    } else if (allAnswered) {
      // If all MC questions answered, use MC score as confidence and mark assessment complete
      learningConfidence = mcScore;
      problem.learning_assessment.learning_confidence = learningConfidence;
      problem.learning_assessment.assessment_completed = true;
    }
    
    let problemCompleted = false;
    let clearProblemId = false;
    let newProblemPrompt = null;

    if (mcQuizPassed) {
      // Student passed - complete problem and allow new problem
      problem.completed = true;
      problemCompleted = true;
      clearProblemId = true;
      newProblemPrompt = "Great job! You passed the quiz! Is there another problem you want to do?";
      logger.info(`[MC QUIZ] Student passed MC quiz: ${Math.round(mcScore * 100)}% (threshold: ${Math.round(MC_PASS_THRESHOLD * 100)}%)`);
    } else if (mcQuizFailed) {
      // Student failed - mark for teacher attention, complete problem, and allow new problem
      problem.learning_assessment.mc_quiz_failed = true;
      problem.learning_assessment.mc_quiz_failed_at = new Date().toISOString();
      problem.completed = true;
      problemCompleted = true;
      clearProblemId = true;
      newProblemPrompt = "It looks like you might need more help with this topic. Don't worry - I've let your teacher know so they can help you. Would you like to try a different problem?";
      logger.warn(`[MC QUIZ] Student failed MC quiz: ${Math.round(mcScore * 100)}% (threshold: ${Math.round(MC_PASS_THRESHOLD * 100)}%) - flagged for teacher attention, problem completed`);
    }

    // Update session
    const session = await getSession(sessionCode);
    const updatedProblems = session.problems.map(p =>
      p.problem_id === problem.problem_id ? problem : p
    );

    const sessionUpdates = {
      problems: updatedProblems
    };

    // Clear current problem ID if quiz passed or failed (problem is completed either way)
    if (clearProblemId) {
      sessionUpdates.current_problem_id = null;
    }

    await updateSession(sessionCode, sessionUpdates);

    res.json({
      session_code: sessionCode,
      mc_result: {
        question_id: questionId,
        correct: updatedQuestion.correct,
        mc_score: mcScore,
        all_answered: allAnswered,
        next_question_index: allAnswered ? null : currentIndex,
        transfer_problem: transferProblem,
        learning_confidence: learningConfidence,
        updated_questions: updatedQuestions, // Send updated questions array with student answers
        mc_quiz_passed: mcQuizPassed,
        mc_quiz_failed: mcQuizFailed,
        problem_completed: problemCompleted,
        new_problem_prompt: newProblemPrompt
      },
      problem_info: {
        problem_id: problem.problem_id,
        category: problem.category,
        difficulty: problem.difficulty,
        normalized_latex: problem.normalized_latex || null
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Handle transfer problem answer
 */
async function handleTransferAnswer(sessionCode, problem, studentAnswer, res, next) {
  try {
    if (!problem.learning_assessment || !problem.learning_assessment.transfer_problem) {
      throw new ValidationError('No transfer problem available', 'assessment');
    }

    // Use LLM to verify if transfer answer is correct
    const transferProblem = problem.learning_assessment.transfer_problem;
    const prompt = `The student was asked to solve this transfer problem using the same approach as the original problem.

Transfer problem: ${transferProblem.problem_text}
Student's answer: "${studentAnswer}"

Determine if the student's answer is correct. Respond with ONLY a JSON object:
{
  "is_correct": true or false,
  "reasoning": "brief explanation"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at verifying math answers. Respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 100,
      temperature: 0.3
    });

    const content = response.choices[0]?.message?.content?.trim() || '{}';
    const cleanedContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const result = JSON.parse(cleanedContent);

    const transferSuccess = result.is_correct || false;

    // Calculate final learning confidence
    const mcScore = problem.learning_assessment.mc_score || 0;
    const learningConfidence = calculateLearningConfidence(mcScore, transferSuccess);

    // Update assessment
    problem.learning_assessment.transfer_success = transferSuccess;
    problem.learning_assessment.transfer_answer = studentAnswer;
    problem.learning_assessment.learning_confidence = learningConfidence;
    problem.learning_assessment.assessment_completed = true;

    // Get recommendation
    const recommendation = getAdaptiveRecommendation(learningConfidence, problem);

    // Update session
    const session = await getSession(sessionCode);
    const updatedProblems = session.problems.map(p =>
      p.problem_id === problem.problem_id ? problem : p
    );

    await updateSession(sessionCode, { problems: updatedProblems });

    res.json({
      session_code: sessionCode,
      transfer_result: {
        correct: transferSuccess,
        learning_confidence: learningConfidence,
        recommendation: recommendation,
        reward: transferSuccess ? {
          type: 'star',
          message: '🌟 Great job! You earned extra credit!'
        } : null
      },
      problem_info: {
        problem_id: problem.problem_id,
        category: problem.category,
        difficulty: problem.difficulty,
        normalized_latex: problem.normalized_latex || null
      }
    });
  } catch (error) {
    next(error);
  }
}

