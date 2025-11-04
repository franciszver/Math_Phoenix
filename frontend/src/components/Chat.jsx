import { useState, useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ProblemInput } from './ProblemInput';
import { sendChatMessage, submitProblem } from '../services/api';
import './Chat.css';

/**
 * Chat Component
 * Main chat interface for the math tutoring session
 */
export function Chat({ sessionCode, initialMessages = [], hasActiveProblem = false, onError }) {
  const [messages, setMessages] = useState(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [currentProblem, setCurrentProblem] = useState(null);
  const [canSubmitProblem, setCanSubmitProblem] = useState(!hasActiveProblem);
  const messagesEndRef = useRef(null);

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

  const handleProblemSubmit = async (text, imageFile) => {
    if (!sessionCode || !canSubmitProblem) return;

    setIsLoading(true);
    setCanSubmitProblem(false);

    try {
      // Add student message immediately
      const studentMessage = {
        speaker: 'student',
        message: text || `[Image: ${imageFile?.name}]`,
        timestamp: new Date().toISOString()
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
      onError?.(error.response?.data?.error?.message || 'Failed to submit problem');
      setCanSubmitProblem(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChatSend = async (message) => {
    if (!sessionCode || isLoading) return;

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

      // Add tutor response
      const tutorMessage = {
        speaker: 'tutor',
        message: response.tutor_message,
        timestamp: new Date().toISOString(),
        latex: currentProblem?.normalizedLatex
      };
      setMessages(prev => [...prev, tutorMessage]);

    } catch (error) {
      console.error('Error sending message:', error);
      onError?.(error.response?.data?.error?.message || 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-container">
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
          </div>
        )}
      </div>

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
          />
        ))}
        
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
          <ChatInput
            onSend={handleChatSend}
            disabled={isLoading}
            placeholder="Type your response..."
          />
        )}
      </div>
    </div>
  );
}

