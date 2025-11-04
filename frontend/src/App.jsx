import { useState, useEffect } from 'react';
import { ConsentPopup } from './components/ConsentPopup';
import { SessionEntry } from './components/SessionEntry';
import { Chat } from './components/Chat';
import { DashboardLogin } from './components/DashboardLogin';
import { Dashboard } from './components/Dashboard';
import { DashboardLink } from './components/DashboardLink';
import { createSession, resumeSession, getSession, dashboardLogin } from './services/api';
import './App.css';

function App() {
  // Dashboard state
  const [dashboardToken, setDashboardToken] = useState(() => {
    return localStorage.getItem('dashboardToken');
  });
  const [isDashboardRoute, setIsDashboardRoute] = useState(() => {
    return window.location.pathname === '/dashboard';
  });
  
  // Chat app state
  const [hasConsented, setHasConsented] = useState(false);
  const [sessionCode, setSessionCode] = useState(null);
  const [initialMessages, setInitialMessages] = useState([]);
  const [hasActiveProblem, setHasActiveProblem] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [prefilledSessionCode, setPrefilledSessionCode] = useState(null);


  // Clear localStorage on page load to prevent accidental session reuse
  useEffect(() => {
    if (!isDashboardRoute) {
      localStorage.removeItem('mathPhoenixSession');
      
      // Check URL for session code to pre-fill (but don't auto-load)
      const urlParams = new URLSearchParams(window.location.search);
      const urlSessionCode = urlParams.get('session');
      if (urlSessionCode) {
        setPrefilledSessionCode(urlSessionCode);
      }
    }
  }, [isDashboardRoute]);

  // Update route when pathname changes
  useEffect(() => {
    const checkRoute = () => {
      setIsDashboardRoute(window.location.pathname === '/dashboard');
    };
    
    checkRoute();
    window.addEventListener('popstate', checkRoute);
    return () => window.removeEventListener('popstate', checkRoute);
  }, []);

  // Handle dashboard login
  const handleDashboardLogin = async (password) => {
    try {
      const response = await dashboardLogin(password);
      setDashboardToken(response.token);
      localStorage.setItem('dashboardToken', response.token);
    } catch (error) {
      throw new Error(error.response?.data?.error?.message || 'Login failed');
    }
  };

  // Handle dashboard logout
  const handleDashboardLogout = () => {
    setDashboardToken(null);
    localStorage.removeItem('dashboardToken');
    window.history.pushState({}, '', '/');
    setIsDashboardRoute(false);
  };

  // Handle quit/log off from chat session
  const handleQuitSession = () => {
    // Clear everything
    setSessionCode(null);
    setInitialMessages([]);
    setHasActiveProblem(false);
    setError(null);
    localStorage.removeItem('mathPhoenixSession');
    
    // Clear URL parameter
    window.history.pushState({}, '', '/');
    
    // Return to SessionEntry (still consented, but no session)
    // Note: hasConsented stays true, so user goes to SessionEntry
  };

  // Render dashboard if on dashboard route
  if (isDashboardRoute) {
    if (!dashboardToken) {
      return <DashboardLogin onLogin={handleDashboardLogin} />;
    }
    return <Dashboard token={dashboardToken} onLogout={handleDashboardLogout} onError={setError} />;
  }

  const loadSession = async (code) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const session = await resumeSession(code);
      setSessionCode(session.session_code);
      
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
      localStorage.setItem('mathPhoenixSession', session.session_code);
    } catch (error) {
      console.error('Error loading session:', error);
      setError('Failed to load session. Please start a new one.');
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

  const handleNewSession = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const session = await createSession();
      setSessionCode(session.session_code);
      setInitialMessages([]);
      setHasActiveProblem(false);
      // Store session in localStorage for current session use
      localStorage.setItem('mathPhoenixSession', session.session_code);
      
      // Update URL
      window.history.pushState({}, '', `?session=${session.session_code}`);
    } catch (error) {
      console.error('Error creating session:', error);
      setError('Failed to create session. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSessionSubmit = async (code) => {
    await loadSession(code);
  };

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
        initialMessages={initialMessages}
        hasActiveProblem={hasActiveProblem}
        onError={setError}
        onQuit={handleQuitSession}
      />
    </div>
  );
}

export default App;
