import './config/env.js'; // Load environment variables first
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
  deleteSessionHandler 
} from './handlers/dashboardHandler.js';
import { requireDashboardAuth } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3001;
const logger = createLogger();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.put('/api/dashboard/sessions/:code/problems/:problemId', requireDashboardAuth, updateProblemTagsHandler);
app.delete('/api/dashboard/sessions/:code', requireDashboardAuth, deleteSessionHandler);

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

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;

