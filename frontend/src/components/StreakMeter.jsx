import { useEffect, useState } from 'react';
import './StreakMeter.css';

/**
 * Streak Meter Component
 * Visual progress bar that fills on progress and resets on hints
 */
export function StreakMeter({ progress, completed, onCelebrate }) {
  const [animatedProgress, setAnimatedProgress] = useState(progress || 0);
  const [showCelebration, setShowCelebration] = useState(false);

  // Animate progress bar
  useEffect(() => {
    if (progress !== undefined) {
      setAnimatedProgress(progress);
    }
  }, [progress]);

  // Handle celebration when streak completes
  useEffect(() => {
    if (completed && !showCelebration) {
      setShowCelebration(true);
      onCelebrate?.();
      
      // Hide celebration after animation
      setTimeout(() => {
        setShowCelebration(false);
      }, 2000);
    }
  }, [completed, showCelebration, onCelebrate]);

  // Determine color based on progress
  const getColor = () => {
    if (animatedProgress >= 80) return '#4CAF50'; // Green
    if (animatedProgress >= 50) return '#FF9800'; // Orange
    if (animatedProgress >= 20) return '#FFC107'; // Yellow
    return '#9E9E9E'; // Gray
  };

  return (
    <div className="streak-meter-container">
      <div className="streak-meter-label">Streak</div>
      <div className="streak-meter-bar">
        <div
          className="streak-meter-fill"
          style={{
            width: `${animatedProgress}%`,
            backgroundColor: getColor(),
            transition: 'width 0.5s ease, background-color 0.5s ease'
          }}
        />
        <div className="streak-meter-text">{Math.round(animatedProgress)}%</div>
      </div>
      {showCelebration && (
        <div className="streak-celebration">
          <span className="celebration-text">🌟 Great job! Streak complete! 🌟</span>
        </div>
      )}
    </div>
  );
}

