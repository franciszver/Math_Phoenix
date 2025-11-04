import { useState, useEffect } from 'react';
import { getAggregateStats } from '../services/api';
import './AggregateView.css';

/**
 * Aggregate View Component
 * Displays overall statistics across all sessions
 */
export function AggregateView({ token, onError }) {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [token]);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const data = await getAggregateStats(token);
      setStats(data);
    } catch (error) {
      console.error('Error loading aggregate stats:', error);
      onError?.(error.response?.data?.error?.message || 'Failed to load statistics');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="loading-stats">Loading statistics...</div>;
  }

  if (!stats) {
    return <div className="no-stats">No statistics available</div>;
  }

  return (
    <div className="aggregate-view">
      <h2>Overall Statistics</h2>
      
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.totalSessions}</div>
          <div className="stat-label">Total Sessions</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value">{stats.totalProblems}</div>
          <div className="stat-label">Total Problems</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value">{stats.totalHints}</div>
          <div className="stat-label">Total Hints Used</div>
        </div>
      </div>

      <div className="distribution-section">
        <div className="distribution-card">
          <h3>Problems by Category</h3>
          <div className="distribution-list">
            <div className="distribution-item">
              <span className="dist-label">Arithmetic</span>
              <span className="dist-value">{stats.categories.arithmetic}</span>
            </div>
            <div className="distribution-item">
              <span className="dist-label">Algebra</span>
              <span className="dist-value">{stats.categories.algebra}</span>
            </div>
            <div className="distribution-item">
              <span className="dist-label">Geometry</span>
              <span className="dist-value">{stats.categories.geometry}</span>
            </div>
            <div className="distribution-item">
              <span className="dist-label">Word Problems</span>
              <span className="dist-value">{stats.categories.word}</span>
            </div>
            <div className="distribution-item">
              <span className="dist-label">Multi-step</span>
              <span className="dist-value">{stats.categories['multi-step']}</span>
            </div>
            {stats.categories.other > 0 && (
              <div className="distribution-item">
                <span className="dist-label">Other</span>
                <span className="dist-value">{stats.categories.other}</span>
              </div>
            )}
          </div>
        </div>

        <div className="distribution-card">
          <h3>Problems by Difficulty</h3>
          <div className="distribution-list">
            <div className="distribution-item">
              <span className="dist-label">Easy</span>
              <span className="dist-value">{stats.difficulties.easy}</span>
            </div>
            <div className="distribution-item">
              <span className="dist-label">Medium</span>
              <span className="dist-value">{stats.difficulties.medium}</span>
            </div>
            <div className="distribution-item">
              <span className="dist-label">Hard</span>
              <span className="dist-value">{stats.difficulties.hard}</span>
            </div>
            {stats.difficulties.unknown > 0 && (
              <div className="distribution-item">
                <span className="dist-label">Unknown</span>
                <span className="dist-value">{stats.difficulties.unknown}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {stats.learning && stats.learning.totalAssessed > 0 && (
        <div className="learning-section">
          <h2>Learning Assessment Metrics</h2>
          
          <div className="stats-grid">
            <div className="stat-card learning-card">
              <div className="stat-value learning-confidence">
                {Math.round(stats.learning.averageConfidence * 100)}%
              </div>
              <div className="stat-label">Average Learning Confidence</div>
              <div className={`confidence-indicator ${
                stats.learning.averageConfidence >= 0.8 ? 'high' :
                stats.learning.averageConfidence >= 0.5 ? 'medium' : 'low'
              }`}>
                {stats.learning.averageConfidence >= 0.8 ? 'High' :
                 stats.learning.averageConfidence >= 0.5 ? 'Medium' : 'Low'}
              </div>
            </div>

            <div className="stat-card learning-card">
              <div className="stat-value">
                {Math.round(stats.learning.masteryRate * 100)}%
              </div>
              <div className="stat-label">Mastery Rate</div>
              <div className="stat-subtitle">(Confidence ≥ 80%)</div>
            </div>

            <div className="stat-card learning-card">
              <div className="stat-value">{stats.learning.totalAssessed}</div>
              <div className="stat-label">Problems Assessed</div>
            </div>

            {stats.learning.transferSuccessRate > 0 && (
              <div className="stat-card learning-card">
                <div className="stat-value">
                  {Math.round(stats.learning.transferSuccessRate * 100)}%
                </div>
                <div className="stat-label">Transfer Success Rate</div>
              </div>
            )}
          </div>

          {stats.learning.completionGap > 0 && (
            <div className="completion-gap-alert">
              <span className="alert-icon">⚠️</span>
              <span>
                {stats.learning.completionGap} problems completed but show low learning confidence.
                Students may need additional support.
              </span>
            </div>
          )}

          {stats.learning.mcQuizFailures > 0 && (
            <div className="mc-quiz-failure-alert">
              <span className="alert-icon">🔴</span>
              <span>
                <strong>{stats.learning.mcQuizFailures}</strong> MC quiz failure{stats.learning.mcQuizFailures > 1 ? 's' : ''} detected.
                These students failed the understanding assessment and may need additional attention.
              </span>
            </div>
          )}

          <div className="learning-breakdown">
            <h3>Confidence Distribution</h3>
            <div className="confidence-bars">
              <div className="confidence-bar-item">
                <span className="bar-label">High (≥80%)</span>
                <div className="bar-container">
                  <div 
                    className="bar-fill high-bar"
                    style={{ width: `${(stats.learning.highConfidence / stats.learning.totalAssessed) * 100}%` }}
                  />
                  <span className="bar-value">{stats.learning.highConfidence}</span>
                </div>
              </div>
              <div className="confidence-bar-item">
                <span className="bar-label">Medium (50-79%)</span>
                <div className="bar-container">
                  <div 
                    className="bar-fill medium-bar"
                    style={{ width: `${(stats.learning.mediumConfidence / stats.learning.totalAssessed) * 100}%` }}
                  />
                  <span className="bar-value">{stats.learning.mediumConfidence}</span>
                </div>
              </div>
              <div className="confidence-bar-item">
                <span className="bar-label">Low (&lt;50%)</span>
                <div className="bar-container">
                  <div 
                    className="bar-fill low-bar"
                    style={{ width: `${(stats.learning.lowConfidence / stats.learning.totalAssessed) * 100}%` }}
                  />
                  <span className="bar-value">{stats.learning.lowConfidence}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

