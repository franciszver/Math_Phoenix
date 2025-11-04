import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import './ChatMessage.css';

/**
 * Chat Message Component
 * Displays a single message with KaTeX rendering for equations and image previews
 */
export function ChatMessage({ message, speaker, latex, imageUrl, isStreakFeedback, isError }) {
  // Insert spaces before common word boundaries (for OCR text that may lack spaces)
  const insertSpaces = (text) => {
    if (!text) return '';
    
    // Protect quoted strings (especially algebraic expressions like '3x', "3x", etc.)
    const quotedStrings = [];
    let protectedIndex = 0;
    
    // Replace quoted content with placeholders
    const protectedText = text.replace(/['"]([^'"]*)['"]/g, (match, content) => {
      const placeholder = `__QUOTED_${protectedIndex}__`;
      quotedStrings[protectedIndex] = match; // Store the full quoted string including quotes
      protectedIndex++;
      return placeholder;
    });
    
    let result = protectedText;
    
    // FIRST: Merge incorrectly split words from OCR
    // Common words that OCR might split incorrectly
    // Apply in order: longest/most specific patterns first
    const wordMerges = [
      // Fix three-part splits (most specific first)
      { pattern: /\b(in)\s+(formati)\s+(on)\b/gi, replacement: 'information' },
      { pattern: /\b(underst)\s+(and)\b/gi, replacement: 'understand' },
      { pattern: /\b(to)\s+(gether)\b/gi, replacement: 'together' },
      // Fix two-part splits
      { pattern: /\b(wh)\s+(at)\b/gi, replacement: 'what' },
      { pattern: /\b(ab)\s+(out)\b/gi, replacement: 'about' },
      { pattern: /\b(be)\s+(tween)\b/gi, replacement: 'between' },
      { pattern: /\b(be)\s+(cause)\b/gi, replacement: 'because' },
      { pattern: /\b(comm)\s+(on)\b/gi, replacement: 'common' },
      { pattern: /\b(unkn)\s+(own)\b/gi, replacement: 'unknown' },
      { pattern: /\b(th)\s+(at)\b/gi, replacement: 'that' },
      { pattern: /\b(c)\s+(all)\b/gi, replacement: 'call' },
      { pattern: /\b(f)\s+(or)\b/gi, replacement: 'for' },
      { pattern: /\b(formati)\s+(on)\b/gi, replacement: 'formation' },
      { pattern: /\b(equati)\s+(on)\b/gi, replacement: 'equation' },
      { pattern: /\b(in)\s+(formation)\b/gi, replacement: 'information' },
      { pattern: /\b(pr)\s+(ice)\b/gi, replacement: 'price' },
      { pattern: /\b(sec)\s+(ond)\b/gi, replacement: 'second' },
      { pattern: /\b(fir)\s+(st)\b/gi, replacement: 'first' },
      { pattern: /\b(thi)\s+(rd)\b/gi, replacement: 'third' },
      { pattern: /\b(les)\s+(s)\b/gi, replacement: 'less' },
      { pattern: /\b(mor)\s+(e)\b/gi, replacement: 'more' },
      { pattern: /\b(tim)\s+(es)\b/gi, replacement: 'times' },
      { pattern: /\b(cos)\s+(t)\b/gi, replacement: 'cost' },
      { pattern: /\b(bo)\s+(ok)\b/gi, replacement: 'book' },
      { pattern: /\b(do)\s+(es)\b/gi, replacement: 'does' },
      { pattern: /\b(ha)\s+(ve)\b/gi, replacement: 'have' },
      { pattern: /\b(wi)\s+(ll)\b/gi, replacement: 'will' },
      { pattern: /\b(wo)\s+(uld)\b/gi, replacement: 'would' },
      { pattern: /\b(sh)\s+(ould)\b/gi, replacement: 'should' },
      { pattern: /\b(co)\s+(uld)\b/gi, replacement: 'could' },
      { pattern: /\b(wh)\s+(ich)\b/gi, replacement: 'which' },
      { pattern: /\b(wh)\s+(en)\b/gi, replacement: 'when' },
      { pattern: /\b(wh)\s+(ere)\b/gi, replacement: 'where' },
      { pattern: /\b(wh)\s+(y)\b/gi, replacement: 'why' },
      { pattern: /\b(ho)\s+(w)\b/gi, replacement: 'how' },
      { pattern: /\b(pr)\s+(oblem)\b/gi, replacement: 'problem' },
      { pattern: /\b(pr)\s+(ice)\b/gi, replacement: 'price' },
    ];
    
    // Apply word merges - do multiple passes to catch nested patterns
    for (let i = 0; i < 3; i++) {
      wordMerges.forEach(({ pattern, replacement }) => {
        result = result.replace(pattern, replacement);
      });
    }
    
    // More general patterns for common splits (after specific ones)
    result = result.replace(/\b([a-z]{1,2})\s+([a-z]{2,4})\s+(ion)\b/gi, (match, p1, p2) => {
      // Only merge if it forms a valid word ending
      if (p1.endsWith('at') || p1.endsWith('it') || p1.endsWith('iz') || p1.endsWith('form')) {
        return p1 + p2 + 'ion';
      }
      return match;
    });
    
    result = result.replace(/\b([a-z]{1,2})\s+(tion)\b/gi, (match, p1) => {
      if (p1.endsWith('a') || p1.endsWith('e') || p1.endsWith('i') || p1.endsWith('o') || p1.endsWith('u')) {
        return p1 + 'tion';
      }
      return match;
    });
    
    // Insert space before uppercase letters after lowercase (camelCase)
    result = result.replace(/([a-z])([A-Z])/g, '$1 $2');
    
    // Insert space between digits and letters (both directions)
    // BUT: Don't split if it looks like it's part of a mathematical expression
    // Only split if it's clearly a word boundary (e.g., "book10" or "10lessthan")
    result = result.replace(/(\d)([a-z]{3,})/g, '$1 $2'); // Digit followed by 3+ lowercase letters
    result = result.replace(/([a-z]{3,})(\d)/g, '$1 $2'); // 3+ lowercase letters followed by digit
    // Don't split single letters with digits (like 'x' in '3x' - but these are already protected)
    
    // Insert space after punctuation followed by letters (but not before punctuation)
    result = result.replace(/([.,;:!?])([a-zA-Z])/g, '$1 $2');
    
    // Insert space after common short words followed by lowercase letters
    // This handles cases like "Ifwe" -> "If we", "Nowwe" -> "Now we"
    const shortWords = ['if', 'we', 'now', 'so', 'to', 'in', 'on', 'at', 'is', 'it', 'as', 'be', 'by', 'or', 'an', 'am'];
    shortWords.forEach(word => {
      const regex = new RegExp(`([^a-zA-Z]|^)(${word})([a-z]{2,})`, 'gi');
      result = result.replace(regex, (match, prefix, word, rest) => {
        return prefix + word + ' ' + rest;
      });
    });
    
    // Insert spaces before common words that might be concatenated
    // Order matters - longer words first to avoid partial matches
    const commonWords = [
      // Compound words
      'threetimes', 'twotimes', 'firstbook', 'secondbook', 'thirdbook',
      'lessthan', 'morethan', 'greaterthan', 'theprice', 'thecost', 'thefirst', 'thesecond',
      'andit', 'andthe', 'itis', 'itcost', 'itcosts',
      // Common words
      'represent', 'equation', 'form', 'get', 'also', 'know', 'that', 'second', 'costs',
      'times', 'price', 'cost', 'book', 'books', 'first', 'third', 'fourth', 'fifth',
      'the', 'and', 'of', 'it', 'is', 'than', 'less', 'more', 'we', 'if', 'in', 'this',
      'can', 'how', 'what', 'when', 'where', 'why', 'which', 'who', 'will', 'would',
      'should', 'could', 'may', 'might', 'must', 'have', 'has', 'had', 'do', 'does', 'did',
      'not', 'but', 'or', 'so', 'to', 'for', 'with', 'from', 'by', 'at', 'on', 'up', 'out',
      'about', 'into', 'over', 'after', 'under', 'again', 'further', 'then', 'once',
      'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'both', 'few', 'more',
      'most', 'other', 'some', 'such', 'no', 'nor', 'own', 'same', 'than', 'too', 'very',
      'can', 'just', 'should', 'now', 'take', 'multiply', 'subtract'
    ];
    
    // Process in multiple passes - longer words first
    const sortedWords = commonWords.sort((a, b) => b.length - a.length);
    
    sortedWords.forEach(word => {
      // Insert space before word if it's not already preceded by a space or punctuation
      const directRegex = new RegExp(`([a-zA-Z0-9])(${word})(?![a-zA-Z])`, 'gi');
      result = result.replace(directRegex, `$1 ${word}`);
    });
    
    // Clean up multiple spaces
    result = result.replace(/\s+/g, ' ');
    
    // Restore protected quoted strings
    quotedStrings.forEach((quoted, index) => {
      result = result.replace(`__QUOTED_${index}__`, quoted);
    });
    
    return result.trim();
  };

  // Render message with LaTeX support
  const renderMessageWithLatex = (text) => {
    if (!text) return '';
    
    // OCR text correction is handled in the backend for word problems
    // Tutor messages come from LLM and should not be formatted
    // Student messages are typed by the user and should not be formatted
    // Therefore, display text as-is without any formatting
    const spacedText = text;
    
    // Clean up latex if it has quotes
    const cleanLatex = latex ? latex.replace(/"/g, '').trim() : null;
    
    // If we have LaTeX and the message contains it, render it separately
    if (cleanLatex && spacedText.includes(cleanLatex)) {
      const parts = spacedText.split(cleanLatex);
      return (
        <>
          {parts[0] && <span>{parts[0]}</span>}
          <BlockMath math={cleanLatex} />
          {parts[1] && <span>{parts[1]}</span>}
        </>
      );
    }
    
    // Check for inline LaTeX patterns like $...$ or \(...\)
    // Be very conservative - only match if it's clearly mathematical
    // This prevents OCR text (especially word problems) from being incorrectly rendered as math
    const dollarPattern = /\$([^$]+)\$/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    
    while ((match = dollarPattern.exec(spacedText)) !== null) {
      const mathContent = match[1].trim();
      
      // Only treat as LaTeX if it's clearly mathematical:
      // - Contains math operators (+, -, ×, ÷, /, =, etc.)
      // - Contains variables with operators (like "x", "3x", "x+5")
      // - Contains numbers with operators (like "3+5", "10-2")
      // BUT NOT if it looks like currency or regular text (like "$10" or "$price")
      const hasMathOperators = /[+\-×*÷\/=<>≤≥(){}[\]^]/.test(mathContent);
      const hasVariableExpressions = /[a-z]\s*[+\-×*÷\/=]|\d+\s*[a-z]|[a-z]\s*\d+/.test(mathContent);
      const isCurrencyOrText = /^\$?\d+\.?\d*$|^\w+\s+\w+/.test(mathContent); // "$10" or "price of" - not math
      
      // Only render as LaTeX if it has clear math patterns AND doesn't look like currency/text
      if ((hasMathOperators || hasVariableExpressions) && !isCurrencyOrText && mathContent.length > 0 && mathContent.length < 50) {
        // Add text before LaTeX
        if (match.index > lastIndex) {
          parts.push({ type: 'text', content: spacedText.substring(lastIndex, match.index) });
        }
        // Add LaTeX
        parts.push({ type: 'latex', content: mathContent, inline: true });
        lastIndex = match.index + match[0].length;
      }
      // If not math-like, treat as regular text (it will be included in the remaining text)
    }
    
    // Add remaining text
    if (lastIndex < spacedText.length) {
      parts.push({ type: 'text', content: spacedText.substring(lastIndex) });
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
          <span>{spacedText}</span>
          <div className="latex-preview">
            <BlockMath math={cleanLatex} />
          </div>
        </>
      );
    }
    
    return spacedText;
  };

  return (
    <div className={`chat-message ${speaker} ${isStreakFeedback ? 'streak-feedback' : ''} ${isError ? 'error-message' : ''}`}>
      {speaker === 'tutor' && (
        <img 
          src="/assets/phoenix-tutor-avatar.png" 
          alt="Phoenix Tutor" 
          className="tutor-avatar"
          onError={(e) => {
            // Hide avatar if image fails to load
            e.target.style.display = 'none';
          }}
        />
      )}
      <div className="message-content">
        {speaker === 'tutor' && <div className="message-label">{isStreakFeedback ? '🔥 Streak Update' : isError ? '⚠️ Error' : 'Phoenix'}</div>}
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

