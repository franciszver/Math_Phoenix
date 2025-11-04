import { useState } from 'react';
import { submitMCAnswer } from '../services/api';
import './MCQuestion.css';

/**
 * Multiple Choice Question Component
 * Displays MC question with clickable answer buttons
 */
export function MCQuestion({ question, sessionCode, onAnswered, disabled }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const handleSelect = async (index) => {
    if (disabled || isSubmitting || result) return;

    setSelectedIndex(index);
    setIsSubmitting(true);

    try {
      const response = await submitMCAnswer(sessionCode, question.question_id, index);
      
      setResult({
        correct: response.mc_result.correct,
        mcScore: response.mc_result.mc_score,
        allAnswered: response.mc_result.all_answered,
        transferProblem: response.mc_result.transfer_problem,
        learningConfidence: response.mc_result.learning_confidence
      });

      onAnswered?.(response.mc_result, response.problem_info);
    } catch (error) {
      console.error('Error submitting MC answer:', error);
      setSelectedIndex(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mc-question-container">
      <div className="mc-question-text">{question.question}</div>
      <div className="mc-options">
        {question.options.map((option, index) => {
          const isSelected = selectedIndex === index;
          const isCorrect = result && question.correct_answer_index === index;
          const isWrong = result && isSelected && !result.correct;

          let buttonClass = 'mc-option';
          if (result) {
            if (isCorrect) {
              buttonClass += ' mc-option-correct';
            } else if (isWrong) {
              buttonClass += ' mc-option-wrong';
            }
          } else if (isSelected) {
            buttonClass += ' mc-option-selected';
          }

          return (
            <button
              key={index}
              className={buttonClass}
              onClick={() => handleSelect(index)}
              disabled={disabled || isSubmitting || result}
            >
              <span className="mc-option-number">{index + 1}</span>
              <span className="mc-option-text">{option}</span>
              {result && isCorrect && <span className="mc-checkmark">✓</span>}
              {result && isWrong && <span className="mc-xmark">✗</span>}
            </button>
          );
        })}
      </div>
      {result && (
        <div className={`mc-feedback ${result.correct ? 'mc-feedback-correct' : 'mc-feedback-wrong'}`}>
          {result.correct ? '✓ Correct!' : '✗ Not quite. The correct answer is highlighted.'}
        </div>
      )}
    </div>
  );
}

