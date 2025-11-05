import { useState, useEffect } from 'react';
import { getAggregateStats, getAllSessions } from '../services/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import './AggregateView.css';

/**
 * Category Pie Chart Component
 * Displays category distribution as a pie chart
 */
function CategoryPieChart({ categories }) {
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
  
  const data = [
    { name: 'Arithmetic', value: categories.arithmetic || 0 },
    { name: 'Algebra', value: categories.algebra || 0 },
    { name: 'Geometry', value: categories.geometry || 0 },
    { name: 'Word Problems', value: categories.word || 0 },
    { name: 'Multi-step', value: categories['multi-step'] || 0 },
    ...(categories.other > 0 ? [{ name: 'Other', value: categories.other }] : [])
  ].filter(item => item.value > 0);

  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (total === 0) {
    return <div className="no-chart-data">No category data available</div>;
  }

  return (
    <div className="pie-chart-container">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value) => [`${value} problems`, 'Count']}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Difficulty Pie Chart Component
 * Displays difficulty distribution as a pie chart, with zero values called out
 */
function DifficultyPieChart({ difficulties }) {
  const COLORS = ['#4CAF50', '#FF9800', '#F44336', '#9E9E9E'];
  
  const allData = [
    { name: 'Easy', value: difficulties.easy || 0 },
    { name: 'Medium', value: difficulties.medium || 0 },
    { name: 'Hard', value: difficulties.hard || 0 },
    ...(difficulties.unknown > 0 ? [{ name: 'Unknown', value: difficulties.unknown }] : [])
  ];

  // Separate data for pie chart (non-zero) and zero values
  const pieData = allData.filter(item => item.value > 0);
  const zeroValues = allData.filter(item => item.value === 0);

  const total = pieData.reduce((sum, item) => sum + item.value, 0);

  // Create data for legend that includes all values including zeros
  const legendData = allData.map((item, index) => ({
    name: item.name,
    value: item.value,
    color: item.value > 0 ? COLORS[index % COLORS.length] : '#E0E0E0',
    isZero: item.value === 0
  }));

  // Custom legend formatter to show zero values
  const renderLegend = () => {
    return (
      <ul className="custom-legend">
        {legendData.map((entry, index) => (
          <li key={`item-${index}`} className={entry.isZero ? 'zero-value' : ''}>
            <span className="legend-color" style={{ backgroundColor: entry.color }}></span>
            <span className="legend-text">
              {entry.name}: {entry.value} {entry.isZero && '(zero)'}
            </span>
          </li>
        ))}
      </ul>
    );
  };

  // If all values are zero, show legend only
  if (total === 0) {
    return (
      <div className="pie-chart-container">
        <div className="all-zero-chart">
          <div className="all-zero-message">All difficulty levels have 0 problems</div>
          {renderLegend()}
        </div>
      </div>
    );
  }

  return (
    <div className="pie-chart-container">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {pieData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value) => [`${value} problems`, 'Count']}
          />
          <Legend content={renderLegend} />
        </PieChart>
      </ResponsiveContainer>
      {zeroValues.length > 0 && (
        <div className="zero-values-note">
          <strong>Note:</strong> {zeroValues.map(v => v.name).join(', ')} {zeroValues.length === 1 ? 'has' : 'have'} 0 problems
        </div>
      )}
    </div>
  );
}

/**
 * Aggregate View Component
 * Displays overall statistics across all sessions
 */
export function AggregateView({ token, onError, onNavigateToSession }) {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionsWithFailures, setSessionsWithFailures] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    loadStats();
  }, [token]);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const data = await getAggregateStats(token);
      setStats(data);
      
      // Load sessions with MC quiz failures
      if (data.learning && data.learning.mcQuizFailures > 0) {
        const sessionsData = await getAllSessions(token);
        const failures = (sessionsData.sessions || []).filter(
          session => {
            // Check if session has mcQuizFailures count
            const hasFailures = session.learning && session.learning.mcQuizFailures > 0;
            
            // Also check if any problems have mc_quiz_failed flag (fallback)
            const hasProblemFailures = session.problems && session.problems.some(
              problem => problem.learning_assessment && problem.learning_assessment.mc_quiz_failed
            );
            
            return hasFailures || hasProblemFailures;
          }
        );
        console.log('Sessions with MC quiz failures:', failures.length, failures);
        setSessionsWithFailures(failures);
      } else {
        setSessionsWithFailures([]);
      }
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
          <CategoryPieChart categories={stats.categories} />
        </div>

        <div className="distribution-card">
          <h3>Problems by Difficulty</h3>
          <DifficultyPieChart difficulties={stats.difficulties} />
        </div>
      </div>

      {stats.learning && stats.learning.totalAssessed > 0 && (
        <div className="learning-section">
          <h2>Learning Assessment Metrics</h2>
          
          <div className="stats-grid">
            <div className="stat-card learning-card">
              <div className="stat-value learning-confidence">
                {Math.round((stats.learning.averageConfidence ?? 0) * 100)}%
              </div>
              <div className="stat-label">Average Learning Confidence</div>
              <div className={`confidence-indicator ${
                (stats.learning.averageConfidence ?? 0) >= 0.8 ? 'high' :
                (stats.learning.averageConfidence ?? 0) >= 0.5 ? 'medium' : 'low'
              }`}>
                {(stats.learning.averageConfidence ?? 0) >= 0.8 ? 'High' :
                 (stats.learning.averageConfidence ?? 0) >= 0.5 ? 'Medium' : 'Low'}
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
              <div className="alert-content">
                <span className="alert-icon">🔴</span>
                <span className="alert-text">
                  <strong>{stats.learning.mcQuizFailures}</strong> MC quiz failure{stats.learning.mcQuizFailures > 1 ? 's' : ''} detected.
                  These students failed the understanding assessment and may need additional attention.
                </span>
                <button 
                  className="dropdown-toggle"
                  onClick={() => setShowDropdown(!showDropdown)}
                  aria-expanded={showDropdown}
                >
                  {showDropdown ? '▼' : '▶'} View Sessions
                </button>
              </div>
              {showDropdown && (
                <div className="failure-dropdown">
                  <div className="dropdown-header">
                    <strong>Sessions Needing Attention {sessionsWithFailures.length > 0 && `(${sessionsWithFailures.length})`}</strong>
                  </div>
                  {sessionsWithFailures.length > 0 ? (
                    <div className="dropdown-list">
                      {sessionsWithFailures.map((session) => {
                        const failureCount = session.learning?.mcQuizFailures || 
                          (session.problems?.filter(p => p.learning_assessment?.mc_quiz_failed).length || 0);
                        return (
                          <button
                            key={session.session_code}
                            className="dropdown-item"
                            onClick={() => {
                              if (onNavigateToSession) {
                                onNavigateToSession(session.session_code);
                              }
                            }}
                          >
                            <div className="session-item-content">
                              <span className="session-code">{session.session_code}</span>
                              <span className="session-meta">
                                {new Date(session.created_at).toLocaleDateString()} • {failureCount} failure{failureCount > 1 ? 's' : ''}
                              </span>
                            </div>
                            <span className="navigate-icon">→</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="dropdown-empty">
                      <span>No sessions found. This may be a data synchronization issue.</span>
                    </div>
                  )}
                </div>
              )}
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

