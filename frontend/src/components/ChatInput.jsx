import { useState } from 'react';
import './ChatInput.css';

/**
 * Chat Input Component
 * Text input for sending messages in the conversation
 */
export function ChatInput({ onSend, disabled, placeholder = "Type your response..." }) {
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!message.trim() || disabled) {
      return;
    }

    onSend(message.trim());
    setMessage('');
  };

  return (
    <form onSubmit={handleSubmit} className="chat-input">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="chat-input-field"
      />
      <button
        type="submit"
        disabled={disabled || !message.trim()}
        className="send-button"
      >
        Send
      </button>
    </form>
  );
}

