import { useState } from 'react';
import './ConsentPopup.css';

/**
 * Consent Popup Component
 * Displays at session start to get user consent
 */
export function ConsentPopup({ onAccept, onDecline }) {
  const [isVisible, setIsVisible] = useState(true);

  const handleAccept = () => {
    setIsVisible(false);
    onAccept();
  };

  const handleDecline = () => {
    setIsVisible(false);
    onDecline();
  };

  if (!isVisible) return null;

  return (
    <div className="consent-overlay">
      <div className="consent-popup">
        <h2>Welcome to Math Phoenix</h2>
        <div className="consent-content">
          <p>
            This tutoring session will be recorded to improve your learning experience 
            and provide teachers with progress insights. By continuing, you consent to 
            this communication being stored and reviewed.
          </p>
        </div>
        <div className="consent-buttons">
          <button onClick={handleAccept} className="btn-primary">
            I Accept
          </button>
          <button onClick={handleDecline} className="btn-secondary">
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

