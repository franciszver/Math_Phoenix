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
    </div>
  );
}

