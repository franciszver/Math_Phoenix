import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { ConsentPopup } from './components/ConsentPopup';
import { SessionEntry } from './components/SessionEntry';
import { Chat } from './components/Chat';
import { DashboardLogin } from './components/DashboardLogin';
import { Dashboard } from './components/Dashboard';
import { DashboardLink } from './components/DashboardLink';
import { CollaborationWorkspace } from './components/CollaborationWorkspace';
import { createSession, resumeSession, getSession, dashboardLogin } from './services/api';
import './App.css';

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Dashboard state - always require password, don't persist token
  const [dashboardToken, setDashboardToken] = useState(null);
  const isDashboardRoute = location.pathname === '/dashboard';
  const isCollaborationRoute = location.pathname.startsWith('/collaboration/');
  
  // Chat app state
  const [hasConsented, setHasConsented] = useState(false);
  const [sessionCode, setSessionCode] = useState(null);
  const [schoolCode, setSchoolCode] = useState(null);
  const [initialMessages, setInitialMessages] = useState([]);
  const [hasActiveProblem, setHasActiveProblem] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [prefilledSessionCode, setPrefilledSessionCode] = useState(null);
  const [collaborationRequested, setCollaborationRequested] = useState(false);
  const [collaborationSessionId, setCollaborationSessionId] = useState(null);


  // Clear dashboard token from localStorage on mount - always require password
  // BUT preserve it on collaboration routes so teachers can be identified
  useEffect(() => {
    if (!isCollaborationRoute) {
      localStorage.removeItem('dashboardToken');
    }
  }, [isCollaborationRoute]);

  // Clear localStorage on page load to prevent accidental session reuse
  // But don't clear if on collaboration route (we need it to identify student)
  useEffect(() => {
    if (!isDashboardRoute && !isCollaborationRoute) {
      localStorage.removeItem('mathPhoenixSession');
      
      // Check URL for session code to pre-fill (but don't auto-load)
      const urlParams = new URLSearchParams(window.location.search);
      const urlSessionCode = urlParams.get('session');
      if (urlSessionCode) {
        setPrefilledSessionCode(urlSessionCode);
      }
    }
  }, [isDashboardRoute, isCollaborationRoute]);

  // Handle collaboration route - render workspace directly
  if (isCollaborationRoute) {
    // Determine if user is teacher or student
    // We'll check this in CollaborationWorkspace by comparing session codes
    // Default: if they have dashboard token, they're likely a teacher
    // But CollaborationWorkspace will verify by checking student_session_id
    const isTeacher = !!dashboardToken;
    return (
      <CollaborationWorkspace 
        token={dashboardToken} 
        isTeacher={isTeacher}
        studentSessionCode={sessionCode || localStorage.getItem('mathPhoenixSession')}
      />
    );
  }

  // Handle dashboard login
  const handleDashboardLogin = async (password) => {
    try {
      const response = await dashboardLogin(password);
      setDashboardToken(response.token);
      // Don't persist token - always require password on next visit
    } catch (error) {
      throw new Error(error.response?.data?.error?.message || 'Login failed');
    }
  };

  // Handle dashboard logout
  const handleDashboardLogout = () => {
    setDashboardToken(null);
    navigate('/');
  };

  // Handle quit/log off from chat session
  const handleQuitSession = () => {
    // Clear everything
    setSessionCode(null);
    setSchoolCode(null);
    setInitialMessages([]);
    setHasActiveProblem(false);
    setError(null);
    localStorage.removeItem('mathPhoenixSession');
    
    // Clear URL parameter
    window.history.pushState({}, '', '/');
    
    // Return to SessionEntry (still consented, but no session)
    // Note: hasConsented stays true, so user goes to SessionEntry
  };

  const loadSession = async (code, enteredSchoolCode) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const session = await resumeSession(code, enteredSchoolCode);
      setSessionCode(session.session_code);
      setSchoolCode(enteredSchoolCode);
      
      // Convert transcript to messages
      const messages = (session.transcript || []).map(entry => ({
        speaker: entry.speaker,
        message: entry.message,
        timestamp: entry.timestamp
      }));
      
      // Get current problem's LaTeX if available
      const currentProblem = session.problems?.find(
        p => p.problem_id === session.current_problem_id
      );
      
      if (currentProblem && messages.length > 0) {
        // Add LaTeX to tutor messages
        messages.forEach(msg => {
          if (msg.speaker === 'tutor') {
            msg.latex = currentProblem.normalized_latex;
          }
        });
      }
      
      setInitialMessages(messages);
      setHasActiveProblem(!!session.current_problem_id);
      setCollaborationRequested(session.collaboration_requested || false);
      setCollaborationSessionId(session.collaboration_session_id || null);
      localStorage.setItem('mathPhoenixSession', session.session_code);
    } catch (error) {
      console.error('Error loading session:', error);
      const errorMessage = error.response?.data?.error?.message || 'Failed to load session. Please check your school code and session code and try again.';
      setError(errorMessage);
      setSessionCode(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConsentAccept = () => {
    setHasConsented(true);
  };

  const handleConsentDecline = () => {
    alert('You must accept the consent to use Math Phoenix.');
  };

  const handleNewSession = async (enteredSchoolCode) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const session = await createSession(enteredSchoolCode);
      setSessionCode(session.session_code);
      setSchoolCode(enteredSchoolCode);
      setInitialMessages([]);
      setHasActiveProblem(false);
      // Store session in localStorage for current session use
      localStorage.setItem('mathPhoenixSession', session.session_code);
      
      // Update URL
      window.history.pushState({}, '', `?session=${session.session_code}`);
    } catch (error) {
      console.error('Error creating session:', error);
      const errorMessage = error.response?.data?.error?.message || 'Failed to create session. Please check your school code and try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSessionSubmit = async (code, schoolCode) => {
    await loadSession(code, schoolCode);
  };

  // Render dashboard if on dashboard route (BEFORE consent check)
  if (isDashboardRoute) {
    if (!dashboardToken) {
      return <DashboardLogin onLogin={handleDashboardLogin} />;
    }
    return <Dashboard token={dashboardToken} onLogout={handleDashboardLogout} onError={setError} />;
  }

  if (!hasConsented) {
    return <ConsentPopup onAccept={handleConsentAccept} onDecline={handleConsentDecline} />;
  }

  if (!sessionCode && !isLoading) {
    return (
      <>
        <div className="app-container">
          <SessionEntry
            onSessionSubmit={handleSessionSubmit}
            onNewSession={handleNewSession}
            prefilledCode={prefilledSessionCode}
            apiError={error}
          />
        </div>
        <DashboardLink />
      </>
    );
  }

  if (isLoading) {
    return (
      <div className="app-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Chat
        sessionCode={sessionCode}
        schoolCode={schoolCode}
        initialMessages={initialMessages}
        hasActiveProblem={hasActiveProblem}
        onError={setError}
        onQuit={handleQuitSession}
        collaborationRequested={collaborationRequested}
        collaborationSessionId={collaborationSessionId}
        onCollaborationRequested={(data) => {
          setCollaborationRequested(data.collaboration_requested);
          setCollaborationSessionId(data.collaboration_session_id);
        }}
      />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/collaboration/:collabSessionId" element={
          <AppContent />
        } />
        <Route path="/*" element={
          <AppContent />
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
