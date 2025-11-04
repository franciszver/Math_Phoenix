import { useState } from 'react';
import './DashboardLink.css';

/**
 * Dashboard Link Component
 * Floating button to access teacher dashboard
 */
export function DashboardLink() {
  const [showTooltip, setShowTooltip] = useState(false);

  const handleClick = () => {
    window.location.href = '/dashboard';
  };

  return (
    <div className="dashboard-link-container">
      <button
        className="dashboard-link-button"
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        aria-label="Access Teacher Dashboard"
      >
        <span className="dashboard-icon">👨‍🏫</span>
      </button>
      {showTooltip && (
        <div className="dashboard-tooltip">
          Looking for the Teacher Dashboard?
        </div>
      )}
    </div>
  );
}

