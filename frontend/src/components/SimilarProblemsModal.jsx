import { useState, useEffect } from 'react';
import './SimilarProblemsModal.css';

/**
 * Similar Problems Modal Component
 * Displays 3 similar problems for teacher to select
 */
export function SimilarProblemsModal({ 
  isOpen, 
  onClose, 
  onSelect, 
  isLoading,
  problems = [] 
}) {
  if (!isOpen) return null;

  return (
    <div className="similar-problems-modal-overlay" onClick={onClose}>
      <div className="similar-problems-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Similar Problems</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          {isLoading ? (
            <div className="loading-problems">Loading similar problems...</div>
          ) : problems.length === 0 ? (
            <div className="no-problems">No similar problems found. Please try again.</div>
          ) : (
            <div className="problems-list">
              {problems.map((problem, index) => (
                <div key={index} className="problem-option">
                  <div className="problem-text">{problem.problemText}</div>
                  <div className="problem-meta">
                    {problem.source === 'database' && problem.similarity !== null && (
                      <span className="similarity-score">
                        {Math.round(problem.similarity * 100)}% similar
                      </span>
                    )}
                    {problem.source === 'generated' && (
                      <span className="generated-label">Generated</span>
                    )}
                  </div>
                  <button
                    className="select-btn"
                    onClick={() => onSelect(problem)}
                  >
                    Select
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

