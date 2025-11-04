import { useState, useEffect } from 'react';
import { getAllSessions, getSessionDetails, updateProblemTags } from '../services/api';
import './SessionListView.css';

/**
 * Session List View Component
 * Displays per-session statistics and allows editing problem tags
 */
export function SessionListView({ token, onError }) {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionDetails, setSessionDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    loadSessions();
  }, [token]);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const data = await getAllSessions(token);
      setSessions(data.sessions || []);
    } catch (error) {
      console.error('Error loading sessions:', error);
      onError?.(error.response?.data?.error?.message || 'Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSessionDetails = async (sessionCode) => {
    setIsLoadingDetails(true);
    try {
      const details = await getSessionDetails(sessionCode, token);
      setSessionDetails(details);
      setSelectedSession(sessionCode);
    } catch (error) {
      console.error('Error loading session details:', error);
      onError?.(error.response?.data?.error?.message || 'Failed to load session details');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleUpdateTags = async (sessionCode, problemId, category, difficulty) => {
    try {
      const updates = {};
      if (category) updates.category = category;
      if (difficulty) updates.difficulty = difficulty;

      await updateProblemTags(sessionCode, problemId, updates, token);
      
      // Reload sessions and details
      await loadSessions();
      if (selectedSession === sessionCode) {
        await loadSessionDetails(sessionCode);
      }
    } catch (error) {
      console.error('Error updating tags:', error);
      onError?.(error.response?.data?.error?.message || 'Failed to update problem tags');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) {
    return <div className="loading-sessions">Loading sessions...</div>;
  }

  return (
    <div className="session-list-view">
      <div className="session-list-container">
        <h2>Sessions</h2>
        <div className="sessions-list">
          {sessions.length === 0 ? (
            <div className="no-sessions">No sessions found</div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.session_code}
                className={`session-item ${selectedSession === session.session_code ? 'selected' : ''}`}
                onClick={() => loadSessionDetails(session.session_code)}
              >
                <div className="session-header">
                  <span className="session-code">{session.session_code}</span>
                  <span className="session-date">{formatDate(session.created_at)}</span>
                </div>
                <div className="session-stats">
                  <span>{session.problems_count} problems</span>
                  <span>{session.hints_used_total} hints</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedSession && (
        <div className="session-details-container">
          <h2>Session Details</h2>
          {isLoadingDetails ? (
            <div className="loading-details">Loading details...</div>
          ) : sessionDetails ? (
            <div className="session-details">
              <div className="details-header">
                <div className="detail-item">
                  <span className="detail-label">Session Code:</span>
                  <span className="detail-value">{sessionDetails.session_code}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Created:</span>
                  <span className="detail-value">{formatDate(sessionDetails.created_at)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Problems:</span>
                  <span className="detail-value">{sessionDetails.problems.length}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Messages:</span>
                  <span className="detail-value">{sessionDetails.transcript_length}</span>
                </div>
              </div>

              <div className="problems-list">
                <h3>Problems</h3>
                {sessionDetails.problems.map((problem) => (
                  <ProblemCard
                    key={problem.problem_id}
                    problem={problem}
                    sessionCode={sessionDetails.session_code}
                    onUpdateTags={handleUpdateTags}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="no-details">No details available</div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Problem Card Component
 * Displays problem information and allows tag editing
 */
function ProblemCard({ problem, sessionCode, onUpdateTags }) {
  const [editingCategory, setEditingCategory] = useState(false);
  const [editingDifficulty, setEditingDifficulty] = useState(false);
  const [category, setCategory] = useState(problem.category || problem.problem_info?.category || 'other');
  const [difficulty, setDifficulty] = useState(problem.difficulty || problem.problem_info?.difficulty || 'unknown');

  const categories = ['arithmetic', 'algebra', 'geometry', 'word', 'multi-step', 'other'];
  const difficulties = ['easy', 'medium', 'hard', 'unknown'];

  const handleCategoryChange = async (newCategory) => {
    setCategory(newCategory);
    setEditingCategory(false);
    await onUpdateTags(sessionCode, problem.problem_id, newCategory, null);
  };

  const handleDifficultyChange = async (newDifficulty) => {
    setDifficulty(newDifficulty);
    setEditingDifficulty(false);
    await onUpdateTags(sessionCode, problem.problem_id, null, newDifficulty);
  };

  return (
    <div className="problem-card">
      <div className="problem-header">
        <span className="problem-id">{problem.problem_id}</span>
        <span className="problem-date">{new Date(problem.created_at).toLocaleDateString()}</span>
      </div>
      
      <div className="problem-tags">
        <div className="tag-editor">
          <span className="tag-label">Category:</span>
          {editingCategory ? (
            <select
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              onBlur={() => setEditingCategory(false)}
              autoFocus
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          ) : (
            <span className="tag-value" onClick={() => setEditingCategory(true)}>
              {category}
            </span>
          )}
        </div>

        <div className="tag-editor">
          <span className="tag-label">Difficulty:</span>
          {editingDifficulty ? (
            <select
              value={difficulty}
              onChange={(e) => handleDifficultyChange(e.target.value)}
              onBlur={() => setEditingDifficulty(false)}
              autoFocus
            >
              {difficulties.map((diff) => (
                <option key={diff} value={diff}>
                  {diff}
                </option>
              ))}
            </select>
          ) : (
            <span className="tag-value" onClick={() => setEditingDifficulty(true)}>
              {difficulty}
            </span>
          )}
        </div>

        <div className="tag-display">
          <span className="tag-label">Hints Used:</span>
          <span className="tag-value">{problem.hints_used_total || 0}</span>
        </div>
      </div>
    </div>
  );
}

