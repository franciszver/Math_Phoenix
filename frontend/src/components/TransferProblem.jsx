import { useState } from 'react';
import { submitTransferAnswer } from '../services/api';
import { ChatInput } from './ChatInput';
import './TransferProblem.css';

/**
 * Transfer Problem Component
 * Displays extra credit transfer problem
 */
export function TransferProblem({ transferProblem, sessionCode, onCompleted, disabled }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [showReward, setShowReward] = useState(false);

  const handleSubmit = async (answer) => {
    if (disabled || isSubmitting || result) return;

    setIsSubmitting(true);

    try {
      const response = await submitTransferAnswer(sessionCode, answer);
      setResult(response.transfer_result);
      
      if (response.transfer_result.reward) {
        setShowReward(true);
        setTimeout(() => setShowReward(false), 3000);
      }

      onCompleted?.(response.transfer_result, response.problem_info);
    } catch (error) {
      console.error('Error submitting transfer answer:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="transfer-problem-container">
      <div className="transfer-problem-header">
        <span className="transfer-badge">🌟 Extra Credit</span>
        <h3>Bonus Problem</h3>
      </div>
      <div className="transfer-problem-text">
        <p>Great job! Want to earn some extra credit? Try this bonus problem:</p>
        <div className="transfer-problem-question">
          {transferProblem.problem_text}
        </div>
      </div>
      
      {!result ? (
        <div className="transfer-input-area">
          <ChatInput
            onSend={handleSubmit}
            disabled={disabled || isSubmitting}
            placeholder="Type your answer..."
          />
        </div>
      ) : (
        <div className={`transfer-result ${result.correct ? 'transfer-result-correct' : 'transfer-result-wrong'}`}>
          <div className="transfer-result-message">
            {result.correct ? (
              <>
                <span className="transfer-success-icon">✓</span>
                <span>Great job! You solved it correctly!</span>
              </>
            ) : (
              <>
                <span className="transfer-fail-icon">✗</span>
                <span>Not quite right, but good effort! The correct approach is the same as before.</span>
              </>
            )}
          </div>
          {result.learning_confidence !== null && (
            <div className="transfer-confidence">
              Learning Confidence: {Math.round(result.learning_confidence * 100)}%
            </div>
          )}
          {result.recommendation && (
            <div className="transfer-recommendation">
              {result.recommendation.message}
            </div>
          )}
        </div>
      )}

      {showReward && result.reward && (
        <div className="transfer-reward">
          <div className="reward-animation">{result.reward.message}</div>
        </div>
      )}
    </div>
  );
}

