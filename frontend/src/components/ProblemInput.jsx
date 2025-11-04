import { useState, useRef } from 'react';
import './ProblemInput.css';

/**
 * Problem Input Component
 * Handles text input and image upload for math problems
 */
export function ProblemInput({ onSubmit, disabled }) {
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!inputText.trim() && !selectedFile) {
      return;
    }

    onSubmit(inputText.trim() || null, selectedFile);
    setInputText('');
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.match(/^image\/(png|jpeg|jpg)$/)) {
        alert('Please upload a PNG or JPG image');
        return;
      }
      
      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.match(/^image\/(png|jpeg|jpg)$/)) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <form onSubmit={handleSubmit} className="problem-input">
      <div className="file-input-wrapper">
        <div
          className={`file-drop-zone ${isDragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !selectedFile && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            onChange={handleFileSelect}
            className="file-input"
            disabled={disabled}
          />
          {selectedFile ? (
            <div className="file-info">
              <span className="file-name">{selectedFile.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile();
                }}
                className="remove-file"
              >
                ×
              </button>
            </div>
          ) : (
            <div className="file-drop-text">
              <span>📷 Upload image</span>
              <span className="file-hint">or drag & drop</span>
            </div>
          )}
        </div>
      </div>

      <div className="text-input-wrapper">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type your math problem here..."
          disabled={disabled || !!selectedFile}
          className="text-input"
        />
      </div>
      
      <button
        type="submit"
        disabled={disabled || (!inputText.trim() && !selectedFile)}
        className="submit-button"
      >
        Submit Problem
      </button>
    </form>
  );
}

