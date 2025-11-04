// Load .env first
import './config/env.js';

// Import express and other modules
import express from 'express';
import cors from 'cors';
import { createLogger } from './utils/logger.js';
import { handleError } from './utils/errorHandler.js';
import { getSessionHandler, createOrGetSessionHandler } from './handlers/sessionHandler.js';
import { submitProblemHandler, selectProblemHandler } from './handlers/problemHandler.js';
import { sendChatMessageHandler } from './handlers/chatHandler.js';
import { upload, validateUpload } from './middleware/upload.js';
import { 
  loginHandler, 
  getAggregateStatsHandler, 
  getAllSessionsHandler, 
  getSessionDetailsHandler,
  updateProblemTagsHandler,
  deleteSessionHandler,
  getSimilarProblemsHandler
} from './handlers/dashboardHandler.js';
import {
  startCollaborationHandler,
  getCollaborationHandler,
  sendCollaborationMessageHandler,
  updateCanvasHandler,
  getCollaborationUpdatesHandler,
  updateDrawingPermissionHandler,
  endCollaborationHandler
} from './handlers/collaborationHandler.js';
import { requireDashboardAuth } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3001;
const logger = createLogger();

// Middleware
// CORS configuration - allow CloudFront and localhost for development
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLOUDFRONT_URL || 'https://d3rfhzm2ptw0c2.cloudfront.net', // CloudFront URL
  'http://localhost:5173' // Local development
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // In production, be strict; in dev, allow localhost
      if (process.env.NODE_ENV === 'production') {
        callback(new Error('Not allowed by CORS'));
      } else {
        callback(null, true); // Allow in development
      }
    }
  },
  credentials: true
}));
// Increase body size limit for canvas operations (up to 10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
// Session routes
app.get('/api/sessions/:code', getSessionHandler);
app.post('/api/sessions', createOrGetSessionHandler);

// Problem routes (with optional image upload)
app.post('/api/sessions/:code/problems', upload.single('image'), submitProblemHandler);
app.post('/api/sessions/:code/problems/select', selectProblemHandler);

// Chat routes
app.post('/api/sessions/:code/chat', sendChatMessageHandler);

// Dashboard routes
// Login (no auth required)
app.post('/api/dashboard/login', loginHandler);

// Protected dashboard routes (require authentication)
app.get('/api/dashboard/stats/aggregate', requireDashboardAuth, getAggregateStatsHandler);
app.get('/api/dashboard/sessions', requireDashboardAuth, getAllSessionsHandler);
app.get('/api/dashboard/sessions/:code', requireDashboardAuth, getSessionDetailsHandler);
app.get('/api/dashboard/sessions/:studentSessionId/similar-problems', requireDashboardAuth, getSimilarProblemsHandler);
app.put('/api/dashboard/sessions/:code/problems/:problemId', requireDashboardAuth, updateProblemTagsHandler);
app.delete('/api/dashboard/sessions/:code', requireDashboardAuth, deleteSessionHandler);

// Collaboration routes
app.post('/api/dashboard/sessions/:studentSessionId/collaboration/start', requireDashboardAuth, startCollaborationHandler);
app.get('/api/collaboration/:collabSessionId', getCollaborationHandler);
app.post('/api/collaboration/:collabSessionId/message', sendCollaborationMessageHandler);
app.post('/api/collaboration/:collabSessionId/canvas', updateCanvasHandler);
app.get('/api/collaboration/:collabSessionId/updates', getCollaborationUpdatesHandler);
app.put('/api/collaboration/:collabSessionId/drawing-permission', updateDrawingPermissionHandler);
app.post('/api/collaboration/:collabSessionId/end', endCollaborationHandler);

// 404 handler (must come before error handler)
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware (must be last)
app.use(handleError);

// Process-level error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;

