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
export async function createSession(schoolCode) {
  const response = await api.post('/api/sessions', { school_code: schoolCode });
  return response.data;
}

/**
 * Get session by code
 */
export async function getSession(sessionCode, schoolCode) {
  const response = await api.get(`/api/sessions/${sessionCode}`, {
    params: { school_code: schoolCode }
  });
  return response.data;
}

/**
 * Resume session (get or create)
 */
export async function resumeSession(sessionCode, schoolCode) {
  const response = await api.post('/api/sessions', { 
    session_code: sessionCode,
    school_code: schoolCode
  });
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
 * Select a problem from multiple detected problems
 */
export async function selectProblem(sessionCode, problemText, imageKey = null) {
  const response = await api.post(`/api/sessions/${sessionCode}/problems/select`, {
    problemText,
    imageKey
  });
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
 * Submit MC answer
 */
export async function submitMCAnswer(sessionCode, questionId, answerIndex) {
  const response = await api.post(`/api/sessions/${sessionCode}/chat`, {
    mc_answer: answerIndex,
    question_id: questionId
  });
  return response.data;
}

/**
 * Submit transfer problem answer
 */
export async function submitTransferAnswer(sessionCode, answer) {
  const response = await api.post(`/api/sessions/${sessionCode}/chat`, {
    transfer_answer: answer
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

/**
 * Delete a session
 */
export async function deleteSession(sessionCode, token) {
  const response = await api.delete(`/api/dashboard/sessions/${sessionCode}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  return response.data;
}

/**
 * Collaboration API Functions
 */

/**
 * Get similar problems for a problem in a session
 */
export async function getSimilarProblems(studentSessionId, problemId, token) {
  const response = await api.get(
    `/api/dashboard/sessions/${studentSessionId}/similar-problems?problemId=${problemId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
  return response.data;
}

/**
 * Start a collaboration session
 */
export async function startCollaboration(studentSessionId, problemText, selectedProblemId, token) {
  const response = await api.post(
    `/api/dashboard/sessions/${studentSessionId}/collaboration/start`,
    {
      problemText,
      selectedProblemId
    },
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
  return response.data;
}

/**
 * Get collaboration session details
 */
export async function getCollaborationSession(collabSessionId) {
  const response = await api.get(`/api/collaboration/${collabSessionId}`);
  return response.data;
}

/**
 * Send a message in collaboration
 */
export async function sendCollaborationMessage(collabSessionId, message, speaker) {
  const response = await api.post(`/api/collaboration/${collabSessionId}/message`, {
    message,
    speaker
  });
  return response.data;
}

/**
 * Update collaboration canvas state
 */
export async function updateCollaborationCanvas(collabSessionId, canvasState) {
  const response = await api.post(`/api/collaboration/${collabSessionId}/canvas`, {
    canvasState
  });
  return response.data;
}

/**
 * Poll for collaboration updates
 */
export async function pollCollaborationUpdates(collabSessionId, sinceTimestamp) {
  const response = await api.get(
    `/api/collaboration/${collabSessionId}/updates?since=${encodeURIComponent(sinceTimestamp)}`
  );
  return response.data;
}

/**
 * Update drawing permission
 */
export async function updateDrawingPermission(collabSessionId, studentCanDraw) {
  const response = await api.put(`/api/collaboration/${collabSessionId}/drawing-permission`, {
    student_can_draw: studentCanDraw
  });
  return response.data;
}

/**
 * End collaboration
 */
export async function endCollaboration(collabSessionId) {
  const response = await api.post(`/api/collaboration/${collabSessionId}/end`);
  return response.data;
}

export default api;

