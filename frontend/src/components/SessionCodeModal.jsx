import { useState } from 'react';
import './SessionCodeModal.css';

/**
 * Session Code Modal Component
 * Displays session code with copy functionality
 */
export function SessionCodeModal({ sessionCode, onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sessionCode);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Failed to copy:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = sessionCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 1500);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="session-code-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h3>Your Session Code</h3>
        <div className="session-code-display">
          <code>{sessionCode}</code>
        </div>
        <p className="session-code-hint">
          Share this code to resume your session on another device
        </p>
        <button 
          className={`copy-button ${copied ? 'copied' : ''}`}
          onClick={handleCopy}
        >
          {copied ? '✓ Copied!' : 'Copy Code'}
        </button>
      </div>
    </div>
  );
}


