import { useState, useEffect } from 'react';
import { ConsentPopup } from './components/ConsentPopup';
import { SessionEntry } from './components/SessionEntry';
import { Chat } from './components/Chat';
import { DashboardLogin } from './components/DashboardLogin';
import { Dashboard } from './components/Dashboard';
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

  // Render dashboard if on dashboard route
  if (isDashboardRoute) {
    if (!dashboardToken) {
      return <DashboardLogin onLogin={handleDashboardLogin} />;
    }
    return <Dashboard token={dashboardToken} onLogout={handleDashboardLogout} onError={setError} />;
  }

  // Check for session code in URL or localStorage
  useEffect(() => {
    // Skip if on dashboard route
    if (isDashboardRoute) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const urlSessionCode = urlParams.get('session');
    
    if (urlSessionCode) {
      loadSession(urlSessionCode);
    } else {
      const savedSession = localStorage.getItem('mathPhoenixSession');
      if (savedSession) {
        loadSession(savedSession);
      }
    }
  }, [isDashboardRoute]);

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
      <div className="app-container">
        <SessionEntry
          onSessionSubmit={handleSessionSubmit}
          onNewSession={handleNewSession}
        />
        {error && <div className="error-banner">{error}</div>}
      </div>
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
      {error && <div className="error-banner">{error}</div>}
      <Chat
        sessionCode={sessionCode}
        initialMessages={initialMessages}
        hasActiveProblem={hasActiveProblem}
        onError={setError}
      />
    </div>
  );
}

export default App;
