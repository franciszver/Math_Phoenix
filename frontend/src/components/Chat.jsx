import { useState, useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ProblemInput } from './ProblemInput';
import { ChatMenu } from './ChatMenu';
import { SessionCodeModal } from './SessionCodeModal';
import { StreakMeter } from './StreakMeter';
import { MCQuestion } from './MCQuestion';
import { TransferProblem } from './TransferProblem';
import { Toast } from './Toast';
import { sendChatMessage, submitProblem } from '../services/api';
import './Chat.css';

/**
 * Chat Component
 * Main chat interface for the math tutoring session
 */
export function Chat({ sessionCode, initialMessages = [], hasActiveProblem = false, onError, onQuit }) {
  const [messages, setMessages] = useState(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [currentProblem, setCurrentProblem] = useState(null);
  const [canSubmitProblem, setCanSubmitProblem] = useState(!hasActiveProblem);
  const [showSessionCodeModal, setShowSessionCodeModal] = useState(false);
  const [streakProgress, setStreakProgress] = useState(0);
  const [streakCompleted, setStreakCompleted] = useState(false);
  const [assessmentState, setAssessmentState] = useState(null); // { mcQuestions, currentMCIndex, transferProblem }
  const [activeProblemWarning, setActiveProblemWarning] = useState(false);
  const [toast, setToast] = useState(null); // { message, type }
  const messagesEndRef = useRef(null);
  const streakCelebratedRef = useRef(false);
  const chatInputRef = useRef(null);

  // Load session data on mount
  useEffect(() => {
    if (sessionCode) {
      // Set initial messages if provided
      if (initialMessages.length > 0) {
        setMessages(initialMessages);
        setCanSubmitProblem(!hasActiveProblem);
      } else {
        setCanSubmitProblem(true);
      }
    }
  }, [sessionCode, initialMessages, hasActiveProblem]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input after tutor messages
  useEffect(() => {
    // Check if the last message is from the tutor
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.speaker === 'tutor' && !isLoading) {
      // Small delay to ensure the message is rendered
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 100);
    }
  }, [messages, isLoading]);

  const handleProblemSubmit = async (text, imageFile) => {
    if (!sessionCode || !canSubmitProblem) {
      // Show temporary warning banner
      setActiveProblemWarning(true);
      setTimeout(() => {
        setActiveProblemWarning(false);
      }, 5000); // Hide after 5 seconds
      return;
    }

    setIsLoading(true);
    setCanSubmitProblem(false);

    try {
      // Create local preview URL for immediate display
      let imagePreviewUrl = null;
      if (imageFile) {
        imagePreviewUrl = URL.createObjectURL(imageFile);
      }

      // Add student message immediately with image preview
      const studentMessage = {
        speaker: 'student',
        message: text || (imageFile ? `Image: ${imageFile.name}` : ''),
        timestamp: new Date().toISOString(),
        imageUrl: imagePreviewUrl || null
      };
      setMessages(prev => [...prev, studentMessage]);

      // Submit problem to backend
      const response = await submitProblem(sessionCode, text, imageFile);
      
      // Update current problem info
      const problemInfo = {
        problemId: response.problem_id,
        category: response.problem_info?.category,
        difficulty: response.problem_info?.difficulty,
        normalizedLatex: response.problem_info?.normalized_latex || null
      };
      setCurrentProblem(problemInfo);

      // Note: We keep the local preview URL since S3 URLs are private
      // In the future, we could generate presigned URLs on the backend for sharing
      // For now, the local preview works immediately and doesn't require backend changes

      // Add tutor response
      const tutorMessage = {
        speaker: 'tutor',
        message: response.tutor_message,
        timestamp: new Date().toISOString(),
        latex: response.problem_info?.normalized_latex || currentProblem?.normalizedLatex
      };
      setMessages(prev => [...prev, tutorMessage]);

    } catch (error) {
      console.error('Error submitting problem:', error);
      const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to submit problem';
      
      // Check if it's the "already active problem" error
      if (errorMessage.includes('already active') || errorMessage.includes('Complete it before')) {
        // Show temporary warning banner instead of error
        setActiveProblemWarning(true);
        setTimeout(() => {
          setActiveProblemWarning(false);
        }, 5000); // Hide after 5 seconds
        // Don't re-enable problem submission
      } else {
        setCanSubmitProblem(true);
        onError?.(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleChatSend = async (message) => {
    if (!sessionCode || isLoading) return;

    // Check if user is trying to submit a problem in the chat input
    // Simple heuristic: if message looks like a problem (contains numbers and math symbols)
    const looksLikeProblem = /[\d+\-*/().=]/.test(message) && message.length > 3;
    if (looksLikeProblem && !canSubmitProblem && currentProblem) {
      // Show temporary warning banner
      setActiveProblemWarning(true);
      setTimeout(() => {
        setActiveProblemWarning(false);
      }, 5000); // Hide after 5 seconds
      return;
    }

    setIsLoading(true);

    try {
      // Add student message immediately
      const studentMessage = {
        speaker: 'student',
        message,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, studentMessage]);

      // Send message to backend
      const response = await sendChatMessage(sessionCode, message);

      // Update problem info if provided (e.g., when tutor provides new problem)
      if (response.problem_info) {
        const problemInfo = {
          problemId: response.problem_info.problem_id,
          category: response.problem_info.category,
          difficulty: response.problem_info.difficulty,
          normalizedLatex: response.problem_info.normalized_latex || null
        };
        setCurrentProblem(problemInfo);
      }

      // Update streak
      if (response.streak) {
        setStreakProgress(response.streak.progress || 0);
        if (response.streak.completed && !streakCelebratedRef.current) {
          setStreakCompleted(true);
          streakCelebratedRef.current = true;
          // Reset flag after celebration
          setTimeout(() => {
            setStreakCompleted(false);
            streakCelebratedRef.current = false;
          }, 2000);
        }
      }

      // Add tutor response
      const tutorMessage = {
        speaker: 'tutor',
        message: response.tutor_message,
        timestamp: new Date().toISOString(),
        latex: response.problem_info?.normalized_latex || currentProblem?.normalizedLatex
      };
      setMessages(prev => [...prev, tutorMessage]);

      // Show streak feedback as toast popup
      if (response.streak?.feedback) {
        setToast({
          message: response.streak.feedback,
          type: 'streak'
        });
      }

      // Handle assessment trigger
      if (response.assessment && response.assessment.triggered) {
        setAssessmentState({
          mcQuestions: response.assessment.mc_questions,
          currentMCIndex: 0,
          transferProblem: null
        });

        // Add assessment message
        const assessmentMessage = {
          speaker: 'tutor',
          message: "Great job! Let's see what you learned. Answer these questions:",
          timestamp: new Date().toISOString(),
          isAssessment: true
        };
        setMessages(prev => [...prev, assessmentMessage]);
      }

    } catch (error) {
      console.error('Error sending message:', error);
      onError?.(error.response?.data?.error?.message || 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMCAnswered = (mcResult, problemInfo) => {
    // Update problem info if provided
    if (problemInfo) {
      const updatedProblemInfo = {
        problemId: problemInfo.problem_id,
        category: problemInfo.category,
        difficulty: problemInfo.difficulty,
        normalizedLatex: problemInfo.normalized_latex || null
      };
      setCurrentProblem(updatedProblemInfo);
    }

    // Check if MC quiz passed or failed - complete problem and enable new problem submission
    if ((mcResult.mc_quiz_passed || mcResult.mc_quiz_failed) && mcResult.problem_completed) {
      // Student passed or failed - clear problem and enable new problem submission
      setCurrentProblem(null);
      setCanSubmitProblem(true);
      
      // Clear assessment state
      setAssessmentState(null);

      // Add completion and new problem prompt
      const mcCompleteMessage = {
        speaker: 'tutor',
        message: `MC Quiz Complete! You got ${Math.round(mcResult.mc_score * 100)}% correct. ${mcResult.new_problem_prompt || 'Is there another problem you want to do?'}`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, mcCompleteMessage]);
      return; // Don't show transfer problem if quiz passed or failed
    }

    // Note: Transfer problem is no longer shown after MC quiz - problem is completed regardless of pass/fail
    // If not all questions answered yet, move to next question
    if (mcResult.next_question_index !== null && mcResult.next_question_index !== undefined) {
      // Move to next question
      setAssessmentState(prev => {
        // Update questions array with student answers
        const updatedQuestions = mcResult.updated_questions || prev.mcQuestions;
        
        // Ensure we have the questions array and valid index
        if (!updatedQuestions || !updatedQuestions[mcResult.next_question_index]) {
          console.error('Invalid question index:', mcResult.next_question_index, 'Questions:', updatedQuestions);
          return prev;
        }
        
        return {
          ...prev,
          mcQuestions: updatedQuestions, // Update with latest answers
          currentMCIndex: mcResult.next_question_index
        };
      });

      // Add feedback message for moving to next question
      const nextQuestionMessage = {
        speaker: 'tutor',
        message: mcResult.correct ? 'Great! ✓' : 'Good try! Let\'s continue.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, nextQuestionMessage]);
    }
  };

  const handleTransferCompleted = (transferResult, problemInfo) => {
    // Update problem info if provided
    if (problemInfo) {
      const updatedProblemInfo = {
        problemId: problemInfo.problem_id,
        category: problemInfo.category,
        difficulty: problemInfo.difficulty,
        normalizedLatex: problemInfo.normalized_latex || null
      };
      setCurrentProblem(updatedProblemInfo);
    }

    // Clear assessment state
    setAssessmentState(null);

    // Add completion message
    const transferMessage = {
      speaker: 'tutor',
      message: transferResult.recommendation?.message || 'Assessment complete!',
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, transferMessage]);
  };

  const handleStreakCelebrate = () => {
    // Celebration handled by animation in StreakMeter component
    console.log('Streak celebration!');
  };

  return (
    <div className="chat-container">
      {/* Toast notification for streak feedback */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={5000}
          onClose={() => setToast(null)}
        />
      )}
      
      <div className="chat-header">
        <h2>Math Phoenix</h2>
        {sessionCode && (
          <div className="session-info">
            <span>Session: {sessionCode}</span>
            {currentProblem && (
              <span className="problem-info">
                {currentProblem.category} • {currentProblem.difficulty}
              </span>
            )}
            {!canSubmitProblem && (
              <StreakMeter
                progress={streakProgress}
                completed={streakCompleted}
                onCelebrate={handleStreakCelebrate}
              />
            )}
          </div>
        )}
        {sessionCode && (
          <ChatMenu
            sessionCode={sessionCode}
            onShowSessionCode={() => setShowSessionCodeModal(true)}
            onQuit={onQuit}
          />
        )}
      </div>

      {showSessionCodeModal && (
        <SessionCodeModal
          sessionCode={sessionCode}
          onClose={() => setShowSessionCodeModal(false)}
        />
      )}

      <div className="chat-messages">
        {messages.length === 0 && canSubmitProblem && (
          <div className="empty-state">
            <p>Submit a math problem to get started!</p>
            <p className="hint">You can type it or upload an image</p>
          </div>
        )}
        
        {messages.map((msg, index) => (
          <ChatMessage
            key={index}
            message={msg.message}
            speaker={msg.speaker}
            latex={msg.latex || currentProblem?.normalizedLatex}
            imageUrl={msg.imageUrl}
            isStreakFeedback={msg.isStreakFeedback}
          />
        ))}

        {/* MC Questions */}
        {assessmentState && assessmentState.mcQuestions && !assessmentState.mcComplete && 
         assessmentState.mcQuestions[assessmentState.currentMCIndex] && (
          <MCQuestion
            key={assessmentState.mcQuestions[assessmentState.currentMCIndex].question_id}
            question={assessmentState.mcQuestions[assessmentState.currentMCIndex]}
            sessionCode={sessionCode}
            onAnswered={handleMCAnswered}
            disabled={isLoading}
          />
        )}

        {/* Transfer Problem */}
        {assessmentState && assessmentState.transferProblem && (
          <TransferProblem
            transferProblem={assessmentState.transferProblem}
            sessionCode={sessionCode}
            onCompleted={handleTransferCompleted}
            disabled={isLoading}
          />
        )}
        
        {isLoading && (
          <div className="loading-indicator">
            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        {canSubmitProblem ? (
          <ProblemInput
            onSubmit={handleProblemSubmit}
            disabled={isLoading}
          />
        ) : (
          <>
            {activeProblemWarning && currentProblem && (
              <div className="active-problem-notice">
                <span className="notice-icon">⚠️</span>
                <span className="notice-text">You already have an active problem: {currentProblem.category} • {currentProblem.difficulty}</span>
                <span className="notice-hint">Complete this problem before submitting a new one</span>
                <button
                  className="notice-close"
                  onClick={() => setActiveProblemWarning(false)}
                  aria-label="Close warning"
                >
                  ×
                </button>
              </div>
            )}
            <ChatInput
              ref={chatInputRef}
              onSend={handleChatSend}
              disabled={isLoading}
              placeholder="Type your response..."
            />
          </>
        )}
      </div>
    </div>
  );
}

