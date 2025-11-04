import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import './ChatMessage.css';

/**
 * Chat Message Component
 * Displays a single message with KaTeX rendering for equations and image previews
 */
export function ChatMessage({ message, speaker, latex, imageUrl, isStreakFeedback }) {
  // Render message with LaTeX support
  const renderMessageWithLatex = (text) => {
    if (!text) return '';
    
    // Clean up latex if it has quotes
    const cleanLatex = latex ? latex.replace(/"/g, '').trim() : null;
    
    // If we have LaTeX and the message contains it, render it separately
    if (cleanLatex && text.includes(cleanLatex)) {
      const parts = text.split(cleanLatex);
      return (
        <>
          {parts[0] && <span>{parts[0]}</span>}
          <BlockMath math={cleanLatex} />
          {parts[1] && <span>{parts[1]}</span>}
        </>
      );
    }
    
    // Check for inline LaTeX patterns like $...$ or \(...\)
    const dollarPattern = /\$([^$]+)\$/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    
    while ((match = dollarPattern.exec(text)) !== null) {
      // Add text before LaTeX
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
      }
      // Add LaTeX
      parts.push({ type: 'latex', content: match[1], inline: true });
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.substring(lastIndex) });
    }
    
    if (parts.length > 0) {
      return parts.map((part, index) => 
        part.type === 'latex' ? (
          <InlineMath key={index} math={part.content} />
        ) : (
          <span key={index}>{part.content}</span>
        )
      );
    }
    
    // If we have LaTeX but it's not in the message, maybe show it below
    if (cleanLatex) {
      return (
        <>
          <span>{text}</span>
          <div className="latex-preview">
            <BlockMath math={cleanLatex} />
          </div>
        </>
      );
    }
    
    return text;
  };

  return (
    <div className={`chat-message ${speaker} ${isStreakFeedback ? 'streak-feedback' : ''}`}>
      <div className="message-content">
        {speaker === 'tutor' && <div className="message-label">{isStreakFeedback ? '🌟 Streak Update' : 'Tutor'}</div>}
        {speaker === 'student' && <div className="message-label">You</div>}
        {imageUrl && (
          <div className="message-image">
            <img 
              src={imageUrl} 
              alt="Uploaded math problem" 
              onError={(e) => {
                // Fallback if image fails to load
                e.target.style.display = 'none';
              }}
            />
          </div>
        )}
        {message && message.trim() && (
          <div className="message-text">
            {renderMessageWithLatex(message)}
          </div>
        )}
      </div>
    </div>
  );
}

