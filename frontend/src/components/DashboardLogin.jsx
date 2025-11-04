import { useState } from 'react';
import './DashboardLogin.css';

/**
 * Dashboard Login Component
 * Password-protected login for teacher dashboard
 */
export function DashboardLogin({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await onLogin(password);
    } catch (err) {
      setError(err.message || 'Invalid password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="dashboard-login">
      <div className="login-container">
        <h1>Teacher Dashboard</h1>
        <p className="login-subtitle">Enter password to access dashboard</p>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter dashboard password"
              disabled={isLoading}
              required
              autoFocus
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={isLoading || !password}>
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

