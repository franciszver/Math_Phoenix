import { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import './ChatInput.css';

/**
 * Chat Input Component
 * Text input for sending messages in the conversation
 */
export const ChatInput = forwardRef(function ChatInput({ onSend, disabled, placeholder = "Type your response..." }, ref) {
  const [message, setMessage] = useState('');
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
    }
  }));

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
        ref={inputRef}
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
});

