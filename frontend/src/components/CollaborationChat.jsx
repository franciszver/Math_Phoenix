import { useState, useRef, useEffect } from 'react';
import './CollaborationChat.css';

/**
 * Collaboration Chat Component
 * Handles chat messages in collaboration workspace
 */
export function CollaborationChat({ 
  messages = [], 
  onSendMessage, 
  speaker, 
  disabled = false 
}) {
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (messageText.trim() && !disabled) {
      onSendMessage(messageText.trim());
      setMessageText('');
    }
  };

  return (
    <div className="collaboration-chat">
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="no-messages">No messages yet. Start the conversation!</div>
        ) : (
          messages.map((msg, index) => {
            const isStudentMessage = msg.speaker === 'student';
            const isTeacherMessage = msg.speaker === 'teacher';
            
            // Show "You" only when the message speaker matches the current viewer
            // Otherwise show the role name
            let speakerLabel;
            if (msg.speaker === speaker) {
              speakerLabel = 'You';
            } else if (isTeacherMessage) {
              speakerLabel = 'Teacher';
            } else {
              speakerLabel = 'Student';
            }
            
            // Alignment: Teacher messages always left, Student messages always right
            const alignmentClass = isStudentMessage ? 'student-aligned' : 'teacher-aligned';
            
            return (
              <div
                key={index}
                className={`message ${alignmentClass} ${isStudentMessage ? 'student-message' : 'teacher-message'}`}
              >
                <div className="message-header">
                  <span className="message-speaker">
                    {speakerLabel}
                  </span>
                  <span className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                </div>
                <div className="message-content">{msg.message}</div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          placeholder={disabled ? "Collaboration ended" : "Type a message..."}
          disabled={disabled}
          className="chat-input"
        />
        <button
          type="submit"
          disabled={disabled || !messageText.trim()}
          className="send-btn"
        >
          Send
        </button>
      </form>
    </div>
  );
}

