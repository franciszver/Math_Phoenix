import { useEffect, useState } from 'react';
import './Toast.css';

/**
 * Toast Notification Component
 * Displays temporary notifications that auto-dismiss
 */
export function Toast({ message, type = 'info', duration = 5000, onClose }) {
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsClosing(true);
      // Wait for animation to complete before calling onClose
      setTimeout(() => {
        onClose?.();
      }, 300); // Match animation duration
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose?.();
    }, 300);
  };

  return (
    <div className={`toast toast-${type} ${isClosing ? 'closing' : ''}`}>
      <div className="toast-content">
        <span className="toast-message">{message}</span>
        <button 
          className="toast-close"
          onClick={handleClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
}

