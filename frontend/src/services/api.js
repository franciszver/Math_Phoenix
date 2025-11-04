/**
 * API Service
 * Handles all backend API calls
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * Create a new session
 */
export async function createSession() {
  const response = await api.post('/api/sessions', {});
  return response.data;
}

/**
 * Get session by code
 */
export async function getSession(sessionCode) {
  const response = await api.get(`/api/sessions/${sessionCode}`);
  return response.data;
}

/**
 * Resume session (get or create)
 */
export async function resumeSession(sessionCode) {
  const response = await api.post('/api/sessions', { session_code: sessionCode });
  return response.data;
}

/**
 * Submit a text problem
 */
export async function submitTextProblem(sessionCode, problemText) {
  const formData = new FormData();
  formData.append('text', problemText);
  
  const response = await api.post(
    `/api/sessions/${sessionCode}/problems`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    }
  );
  return response.data;
}

/**
 * Submit an image problem
 */
export async function submitImageProblem(sessionCode, imageFile) {
  const formData = new FormData();
  formData.append('image', imageFile);
  
  const response = await api.post(
    `/api/sessions/${sessionCode}/problems`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    }
  );
  return response.data;
}

/**
 * Submit a problem (text or image)
 */
export async function submitProblem(sessionCode, text = null, imageFile = null) {
  const formData = new FormData();
  if (text) formData.append('text', text);
  if (imageFile) formData.append('image', imageFile);
  
  const response = await api.post(
    `/api/sessions/${sessionCode}/problems`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    }
  );
  return response.data;
}

/**
 * Send a chat message
 */
export async function sendChatMessage(sessionCode, message) {
  const response = await api.post(`/api/sessions/${sessionCode}/chat`, {
    message
  });
  return response.data;
}

/**
 * Dashboard API Functions
 */

/**
 * Login to dashboard
 */
export async function dashboardLogin(password) {
  const response = await api.post('/api/dashboard/login', { password });
  return response.data;
}

/**
 * Get aggregate statistics
 */
export async function getAggregateStats(token) {
  const response = await api.get('/api/dashboard/stats/aggregate', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  return response.data;
}

/**
 * Get all sessions with stats
 */
export async function getAllSessions(token) {
  const response = await api.get('/api/dashboard/sessions', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  return response.data;
}

/**
 * Get session details
 */
export async function getSessionDetails(sessionCode, token) {
  const response = await api.get(`/api/dashboard/sessions/${sessionCode}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  return response.data;
}

/**
 * Update problem tags (category/difficulty)
 */
export async function updateProblemTags(sessionCode, problemId, updates, token) {
  const response = await api.put(
    `/api/dashboard/sessions/${sessionCode}/problems/${problemId}`,
    updates,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
  return response.data;
}

export default api;

