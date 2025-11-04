import { useState } from 'react';
import { AggregateView } from './AggregateView';
import { SessionListView } from './SessionListView';
import './Dashboard.css';

/**
 * Dashboard Component
 * Main teacher dashboard with view toggle
 */
export function Dashboard({ token, onLogout, onError }) {
  const [viewMode, setViewMode] = useState('aggregate'); // 'aggregate' or 'sessions'
  const [selectedSessionCode, setSelectedSessionCode] = useState(null);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Teacher Dashboard</h1>
        <div className="dashboard-controls">
          <div className="view-toggle">
            <button
              className={viewMode === 'aggregate' ? 'active' : ''}
              onClick={() => setViewMode('aggregate')}
            >
              Aggregate View
            </button>
            <button
              className={viewMode === 'sessions' ? 'active' : ''}
              onClick={() => setViewMode('sessions')}
            >
              Per-Session View
            </button>
          </div>
          <button className="logout-btn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        {viewMode === 'aggregate' ? (
          <AggregateView 
            token={token} 
            onError={onError} 
            onNavigateToSession={(sessionCode) => {
              setSelectedSessionCode(sessionCode);
              setViewMode('sessions');
            }}
          />
        ) : (
          <SessionListView 
            token={token} 
            onError={onError} 
            initialSelectedSession={selectedSessionCode}
            onSessionSelected={() => setSelectedSessionCode(null)}
          />
        )}
      </div>
    </div>
  );
}

