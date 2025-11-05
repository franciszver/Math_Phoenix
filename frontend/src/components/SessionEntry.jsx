import { useState, useEffect } from 'react';
import './SessionEntry.css';

/**
 * Session Entry Component
 * Allows user to enter a session code to resume a session
 */
export function SessionEntry({ onSessionSubmit, onNewSession, prefilledCode = null, apiError = null }) {
  const [schoolCode, setSchoolCode] = useState('');
  const [sessionCode, setSessionCode] = useState(prefilledCode || '');
  const [error, setError] = useState('');

  // Update session code if prefilledCode changes
  useEffect(() => {
    if (prefilledCode) {
      setSessionCode(prefilledCode);
    }
  }, [prefilledCode]);

  // Update error when API error changes
  useEffect(() => {
    if (apiError) {
      setError(apiError);
    }
  }, [apiError]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate school code (required)
    if (!schoolCode.trim()) {
      setError('Please enter a school code');
      return;
    }

    if (!sessionCode.trim()) {
      setError('Please enter a session code');
      return;
    }

    // Validate format (6 alphanumeric characters)
    if (!/^[A-Z0-9]{6}$/i.test(sessionCode.trim())) {
      setError('Session code must be 6 alphanumeric characters');
      return;
    }

    setError('');
    onSessionSubmit(sessionCode.trim().toUpperCase(), schoolCode.trim());
  };

  const handleNewSession = () => {
    // Validate school code (required)
    if (!schoolCode.trim()) {
      setError('Please enter a school code');
      return;
    }

    setError('');
    onNewSession(schoolCode.trim());
  };

  return (
    <div className="session-entry">
      <img 
        src="/assets/math-phoenix-logo.png" 
        alt="Math Phoenix Logo" 
        className="phoenix-logo"
        onError={(e) => {
          // Hide logo if image fails to load
          e.target.style.display = 'none';
        }}
      />
      <h2>Math Phoenix</h2>
      <p className="subtitle">AI-Powered Math Tutor</p>
      
      <form onSubmit={handleSubmit} className="session-form">
        <div className="form-group">
          <label htmlFor="school-code">School Code</label>
          <input
            id="school-code"
            type="password"
            value={schoolCode}
            onChange={(e) => {
              setSchoolCode(e.target.value);
              setError('');
            }}
            placeholder="Enter school code"
            required
            className={error && !schoolCode.trim() ? 'error' : ''}
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="session-code">Enter Session Code (or start new)</label>
          <input
            id="session-code"
            type="text"
            value={sessionCode}
            onChange={(e) => {
              setSessionCode(e.target.value.toUpperCase());
              setError('');
            }}
            placeholder="AB12CD"
            maxLength={6}
            className={error && sessionCode.trim() ? 'error' : ''}
          />
          {error && <span className="error-message">{error}</span>}
        </div>
        
        <div className="form-buttons">
          <button type="submit" className="btn-primary">
            Resume Session
          </button>
          <button 
            type="button" 
            onClick={handleNewSession}
            className="btn-secondary"
          >
            Start New Session
          </button>
        </div>
      </form>
    </div>
  );
}

