import './CollaborationBlockingModal.css';

/**
 * Collaboration Blocking Modal Component
 * Blocks student session when teacher requests collaboration
 */
export function CollaborationBlockingModal({ collaborationSessionId, onJoin }) {
  const handleJoin = () => {
    if (collaborationSessionId) {
      window.location.href = `/collaboration/${collaborationSessionId}`;
    } else if (onJoin) {
      onJoin();
    }
  };

  return (
    <div className="collaboration-blocking-overlay">
      <div className="collaboration-blocking-modal">
        <div className="blocking-icon">👋</div>
        <h2>Hey, a teacher wants to help!</h2>
        <p className="blocking-message">Come on over!</p>
        <p className="blocking-description">
          A teacher has requested to help you with this problem. 
          Please join the collaboration session to continue.
        </p>
        <button className="join-collaboration-btn" onClick={handleJoin}>
          Join Collaboration Session
        </button>
      </div>
    </div>
  );
}





