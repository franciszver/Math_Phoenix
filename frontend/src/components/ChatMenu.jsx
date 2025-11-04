import { useState, useRef, useEffect } from 'react';
import './ChatMenu.css';

/**
 * Chat Menu Component
 * Hamburger menu for chat session actions
 */
export function ChatMenu({ sessionCode, onShowSessionCode, onQuit }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleShowSessionCode = () => {
    setIsOpen(false);
    onShowSessionCode();
  };

  const handleQuit = () => {
    setIsOpen(false);
    onQuit();
  };

  return (
    <div className="chat-menu" ref={menuRef}>
      <button
        className="menu-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Menu"
      >
        <span className="hamburger-icon">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>
      
      {isOpen && (
        <div className="menu-dropdown">
          <button
            className="menu-item"
            onClick={handleShowSessionCode}
          >
            <span className="menu-icon">📋</span>
            Copy Session Code
          </button>
          <button
            className="menu-item menu-item-danger"
            onClick={handleQuit}
          >
            <span className="menu-icon">🚪</span>
            Quit Session
          </button>
        </div>
      )}
    </div>
  );
}

