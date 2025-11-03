import './config/env.js'; // Load environment variables first
import express from 'express';
import cors from 'cors';
import { createLogger } from './utils/logger.js';
import { handleError } from './utils/errorHandler.js';
import { getSessionHandler, createOrGetSessionHandler } from './handlers/sessionHandler.js';
import { submitProblemHandler } from './handlers/problemHandler.js';
import { sendChatMessageHandler } from './handlers/chatHandler.js';
import { upload, validateUpload } from './middleware/upload.js';

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

// Chat routes
app.post('/api/sessions/:code/chat', sendChatMessageHandler);

// 404 handler (must come before error handler)
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware (must be last)
app.use(handleError);

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;

