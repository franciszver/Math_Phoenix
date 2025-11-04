import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CollaborationChat } from './CollaborationChat';
import { CollaborationCanvas } from './CollaborationCanvas';
import {
  getCollaborationSession,
  sendCollaborationMessage,
  updateCollaborationCanvas,
  pollCollaborationUpdates,
  updateDrawingPermission,
  endCollaboration
} from '../services/api';
import './CollaborationWorkspace.css';

/**
 * Collaboration Workspace Component
 * Main collaboration interface with chat and canvas
 */
export function CollaborationWorkspace({ token, isTeacher = false, studentSessionCode = null }) {
  const { collabSessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [canvasState, setCanvasState] = useState(null);
  const [studentCanDraw, setStudentCanDraw] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdateTime, setLastUpdateTime] = useState(new Date().toISOString());
  const lastUpdateTimeRef = useRef(new Date().toISOString());
  const pollingIntervalRef = useRef(null);
  const canvasUpdateTimeoutRef = useRef(null);
  const [actualIsTeacher, setActualIsTeacher] = useState(isTeacher);

  // Determine speaker role - verify by checking if student session matches
  useEffect(() => {
    if (session) {
      // Check if student's session code matches the collaboration's student_session_id
      const currentStudentSessionCode = studentSessionCode || localStorage.getItem('mathPhoenixSession');
      
      if (currentStudentSessionCode && session.student_session_id === currentStudentSessionCode) {
        // Student's session code matches - they're the student
        setActualIsTeacher(false);
      } else if (token) {
        // Has dashboard token and doesn't match student session - they're the teacher
        setActualIsTeacher(true);
      } else {
        // No token and no match - default to student (shouldn't happen, but safety fallback)
        setActualIsTeacher(false);
      }
    }
  }, [session, studentSessionCode, token]);

  const speaker = actualIsTeacher ? 'teacher' : 'student';

  // Load initial session
  useEffect(() => {
    loadSession();
  }, [collabSessionId]);

  // Poll for updates
  useEffect(() => {
    if (!session || session.status !== 'active') return;

    const pollUpdates = async () => {
      try {
        // Use ref to get the latest lastUpdateTime (always current, not stale closure value)
        const currentTime = lastUpdateTimeRef.current;
        const updates = await pollCollaborationUpdates(
          collabSessionId,
          currentTime
        );

        if (updates.messages && updates.messages.length > 0) {
          setMessages(prev => {
            // Deduplicate messages by timestamp + message + speaker
            const existingKeys = new Set(
              prev.map(msg => `${msg.timestamp}-${msg.message}-${msg.speaker}`)
            );
            const newMessages = updates.messages.filter(msg => {
              const key = `${msg.timestamp}-${msg.message}-${msg.speaker}`;
              return !existingKeys.has(key);
            });
            return [...prev, ...newMessages];
          });
        }

        if (updates.canvas_state) {
          setCanvasState(updates.canvas_state);
        }

        if (updates.student_can_draw !== undefined) {
          setStudentCanDraw(updates.student_can_draw);
        }

        if (updates.status && updates.status !== 'active') {
          // Collaboration ended
          setSession(prev => ({ ...prev, status: updates.status }));
        }

        // Update lastUpdateTime to the latest message timestamp, or keep current if no new messages
        if (updates.messages && updates.messages.length > 0) {
          const latestMessage = updates.messages[updates.messages.length - 1];
          const timestamp = latestMessage.timestamp;
          setLastUpdateTime(timestamp);
          lastUpdateTimeRef.current = timestamp;
        }
        // If no new messages, keep current lastUpdateTime (don't update to avoid skipping messages)
      } catch (error) {
        console.error('Error polling updates:', error);
      }
    };

    // Poll every 2-3 seconds
    pollingIntervalRef.current = setInterval(pollUpdates, 2500);
    pollUpdates(); // Initial poll

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [collabSessionId, session?.status]); // Removed lastUpdateTime from deps to avoid restarting

  const loadSession = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await getCollaborationSession(collabSessionId);
      setSession(data);
      setMessages(data.messages || []);
      setCanvasState(data.canvas_state);
      setStudentCanDraw(data.student_can_draw !== false);
      
      // Set lastUpdateTime to the timestamp of the last message, or current time if no messages
      const messages = data.messages || [];
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        const timestamp = lastMessage.timestamp;
        setLastUpdateTime(timestamp);
        lastUpdateTimeRef.current = timestamp;
      } else {
        const timestamp = new Date().toISOString();
        setLastUpdateTime(timestamp);
        lastUpdateTimeRef.current = timestamp;
      }
    } catch (error) {
      console.error('Error loading collaboration session:', error);
      setError('Failed to load collaboration session');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (messageText) => {
    try {
      const response = await sendCollaborationMessage(collabSessionId, messageText, speaker);
      // Use the message from backend response (has exact timestamp)
      if (response.message) {
        setMessages(prev => {
          // Check if message already exists (avoid duplicates)
          const exists = prev.some(msg => 
            msg.timestamp === response.message.timestamp && 
            msg.message === response.message.message &&
            msg.speaker === response.message.speaker
          );
          if (exists) return prev;
          return [...prev, response.message];
        });
        // Update lastUpdateTime to the message timestamp so next poll gets messages after this
        const timestamp = response.message.timestamp;
        setLastUpdateTime(timestamp);
        lastUpdateTimeRef.current = timestamp;
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message');
    }
  };

  const handleCanvasUpdate = (newCanvasState) => {
    setCanvasState(newCanvasState);

    // Debounce canvas updates
    if (canvasUpdateTimeoutRef.current) {
      clearTimeout(canvasUpdateTimeoutRef.current);
    }

    canvasUpdateTimeoutRef.current = setTimeout(async () => {
      try {
        await updateCollaborationCanvas(collabSessionId, newCanvasState);
      } catch (error) {
        console.error('Error updating canvas:', error);
      }
    }, 500);
  };

  const handleToggleDrawingPermission = async () => {
    try {
      const newPermission = !studentCanDraw;
      await updateDrawingPermission(collabSessionId, newPermission);
      setStudentCanDraw(newPermission);
    } catch (error) {
      console.error('Error updating drawing permission:', error);
      setError('Failed to update drawing permission');
    }
  };

  const handleLeave = async () => {
    if (window.confirm('Are you sure you want to leave this collaboration?')) {
      try {
        await endCollaboration(collabSessionId);
        if (actualIsTeacher) {
          navigate('/dashboard');
        } else {
          navigate('/');
        }
      } catch (error) {
        console.error('Error ending collaboration:', error);
        // Navigate anyway
        if (actualIsTeacher) {
          navigate('/dashboard');
        } else {
          navigate('/');
        }
      }
    }
  };

  if (isLoading) {
    return (
      <div className="collaboration-workspace-loading">
        <div>Loading collaboration session...</div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="collaboration-workspace-error">
        <div>{error}</div>
        <button onClick={() => navigate('/')}>Go Home</button>
      </div>
    );
  }

  const isActive = session?.status === 'active';

  return (
    <div className="collaboration-workspace">
      <div className="workspace-header">
        <div className="header-title">
          <h2>{actualIsTeacher ? 'Teacher View' : 'Student View'}</h2>
        </div>
        <div className="header-info">
          <div className="session-info">
            <span className="info-label">Collaboration:</span>
            <span className="info-value">{collabSessionId}</span>
          </div>
          <div className="session-info">
            <span className="info-label">Student Session:</span>
            <span className="info-value">{session?.student_session_id}</span>
          </div>
        </div>
        <div className="header-actions">
          {actualIsTeacher && (
            <button
              className="drawing-permission-btn"
              onClick={handleToggleDrawingPermission}
              disabled={!isActive}
            >
              {studentCanDraw ? '🔒 Disable Drawing' : '🔓 Enable Drawing'}
            </button>
          )}
          <button className="leave-btn" onClick={handleLeave}>
            Leave
          </button>
        </div>
      </div>

      {session?.status !== 'active' && (
        <div className="collaboration-ended-banner">
          This collaboration session has ended.
        </div>
      )}

      <div className="workspace-content">
        <div className="chat-panel">
          <CollaborationChat
            messages={messages}
            onSendMessage={handleSendMessage}
            speaker={speaker}
            disabled={!isActive}
          />
        </div>

        <div className="canvas-panel">
          <div className="problem-display">
            <div className="problem-label">Working on:</div>
            <div className="problem-text">{session?.problem_text || 'No problem selected'}</div>
          </div>
          <CollaborationCanvas
            canvasState={canvasState}
            onCanvasUpdate={handleCanvasUpdate}
            studentCanDraw={studentCanDraw}
            isStudent={!actualIsTeacher}
            disabled={!isActive}
          />
        </div>
      </div>
    </div>
  );
}

