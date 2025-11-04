import { useState } from 'react';
import './ProblemSelection.css';

/**
 * Problem Selection Component
 * Displays multiple detected problems and allows user to select one
 */
export function ProblemSelection({ problems, invalidProblems, imageUrl, onSelect, onCancel }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelect = async () => {
    if (selectedIndex === null || selectedIndex < 0 || selectedIndex >= problems.length) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSelect(problems[selectedIndex]);
    } catch (error) {
      console.error('Error selecting problem:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="problem-selection">
      <div className="problem-selection-header">
        <h3>Multiple Problems Detected</h3>
        <p>I found {problems.length} math problem{problems.length !== 1 ? 's' : ''} in your input. Please select which one you'd like to work on:</p>
      </div>

      {invalidProblems && invalidProblems.length > 0 && (
        <div className="invalid-problems-warning">
          <strong>Note:</strong> {invalidProblems.length} problem{invalidProblems.length !== 1 ? 's were' : ' was'} detected but appear invalid and have been excluded.
        </div>
      )}

      {imageUrl && (
        <div className="problem-selection-image">
          <img src={imageUrl} alt="Problem source" />
        </div>
      )}

      <div className="problems-list">
        {problems.map((problem, index) => (
          <div
            key={index}
            className={`problem-option ${selectedIndex === index ? 'selected' : ''}`}
            onClick={() => setSelectedIndex(index)}
          >
            <div className="problem-number">{index + 1}</div>
            <div className="problem-text">{problem}</div>
            {selectedIndex === index && (
              <div className="selected-indicator">✓</div>
            )}
          </div>
        ))}
      </div>

      <div className="problem-selection-actions">
        <button
          type="button"
          onClick={handleSelect}
          disabled={selectedIndex === null || isSubmitting}
          className="select-button"
        >
          {isSubmitting ? 'Processing...' : 'Select Problem'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="cancel-button"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

