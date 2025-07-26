import { useRef, useEffect } from "react";

export default function ExpandableChatInput({
  rtmInputText = '',
  setRtmInputText = () => {},
  handleSendMessage = () => {},
  disabled,
  isKeyboardVisible,
  setIsKeyboardVisible,
  isPureChatMode = false
}) {
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Helper function to save cursor position
  const saveCursorPosition = () => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      return {
        startOffset: range.startOffset,
        endOffset: range.endOffset,
        startContainer: range.startContainer
      };
    }
    return null;
  };

  // Helper function to restore cursor position
  const restoreCursorPosition = (position) => {
    if (!position || !inputRef.current) return;
    
    try {
      const selection = window.getSelection();
      const range = document.createRange();
      
      // Find the text node to place cursor in
      const textNode = inputRef.current.firstChild || inputRef.current;
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const maxOffset = textNode.textContent.length;
        range.setStart(textNode, Math.min(position.startOffset, maxOffset));
        range.setEnd(textNode, Math.min(position.endOffset, maxOffset));
      } else {
        // If no text node exists, place cursor at the end
        range.selectNodeContents(inputRef.current);
        range.collapse(false);
      }
      
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (error) {
      // Fallback: place cursor at end
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(inputRef.current);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  // Sync external text to contenteditable div with cursor preservation
  useEffect(() => {
    if (inputRef.current && inputRef.current.innerText !== rtmInputText) {
      const cursorPosition = saveCursorPosition();
      const wasFocused = document.activeElement === inputRef.current;
      
      // Update content
      inputRef.current.innerText = rtmInputText;
      
      // Restore focus and cursor position if it was focused
      if (wasFocused) {
        inputRef.current.focus();
        // Use setTimeout to ensure DOM is updated before restoring cursor
        setTimeout(() => {
          if (rtmInputText) {
            restoreCursorPosition(cursorPosition);
          }
        }, 0);
      }
    }
  }, [rtmInputText]);

  const handleInput = (e) => {
    const text = e.target.innerText;
    setRtmInputText(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = inputRef.current?.innerText.trim();
      if (text && !disabled) {
        handleSendMessage();
        setRtmInputText("");
        // Clear input content
        if (inputRef.current) {
          inputRef.current.innerText = "";
        }
      }
    }
  };

  const getPlaceholderText = () => {
    if (disabled) {
      return isPureChatMode ? "Connecting to chat..." : "Connect to start chatting...";
    }
    return "Type a message...";
  };

  return (
    <div className="rtm-input-container" ref={containerRef} id="input-box-container">
      <div className="rtm-input-wrapper">
        <div
          ref={inputRef}
          className={`rtm-input ${disabled ? 'disabled' : ''}`}
          contentEditable={!disabled}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          role="textbox"
          aria-label="Chat input"
          suppressContentEditableWarning={true}
          style={{
            minHeight: '1.2em',
            outline: 'none',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word'
          }}
        />
        {!rtmInputText.replace(/\n/g, '').trim() && (
          <span className="rtm-placeholder">
            {getPlaceholderText()}
          </span>
        )}
      </div>
      <button
        className={`rtm-send-button ${(disabled || !rtmInputText.trim()) ? 'disabled' : ''}`}
        onClick={handleSendMessage}
        disabled={disabled || !rtmInputText.trim()}
        aria-label="Send message"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </div>
  );
}