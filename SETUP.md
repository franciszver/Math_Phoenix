# Setup Guide - Math Phoenix

This guide will help you set up the Math Phoenix development environment.

## Prerequisites

- **Node.js** (>= 18.x) - [Download](https://nodejs.org/)
- **npm** (comes with Node.js)
- **OpenRouter API Key** - [Get one at https://openrouter.ai/keys](https://openrouter.ai/keys)
  - Enable data logging for free models in Settings → Privacy
  - Purchase one-time $10 credit to unlock 1,000 req/day (optional for demo)

## Step 1: Install Dependencies

### Backend
```bash
cd backend
npm install
```

### Frontend
```bash
cd frontend
npm install
```

## Step 2: Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in your values:
   - `OPENROUTER_API_KEY` - Your OpenRouter API key
   - `SESSION_SECRET` - Random secret for session code generation (min 32 chars)
   - `DASHBOARD_PASSWORD` - Password for teacher dashboard
   - Optional: `TEXT_MODEL`, `VISION_MODEL`, `TEXT_MODEL_FALLBACK`, `VISION_MODEL_FALLBACK` (defaults set in backend/src/services/openai.js)

## Step 3: Verify Setup

### Test OpenRouter API
```bash
cd backend
npm run test:openai
```

### Test Vision API (requires test image)
```bash
cd backend
npm run test:vision
```

### Verify all configuration
```bash
cd backend
npm run verify
```

For full verification including API connection test:
```bash
npm run verify:api
```

## Step 4: Start Development Servers

### Terminal 1: Backend
```bash
cd backend
npm run dev
```

The backend will run on `http://localhost:3001`

### Terminal 2: Frontend
```bash
cd frontend
npm run dev
```

The frontend will run on `http://localhost:5173`

## Troubleshooting

### OpenRouter API Errors
- Verify your API key is correct and valid at https://openrouter.ai/keys
- Ensure you have enabled data logging for free models in Settings → Privacy
- Check that you have sufficient free requests remaining (50/day free, 1,000/day after $10 credit)

### Port Already in Use
- Change `PORT` in `.env` for backend
- Change port in `frontend/vite.config.js` for frontend

## Next Steps

Once Phase 0 is complete, proceed to Phase 1:
- Implement problem input (text + image)
- Set up Socratic dialogue engine
- Integrate math rendering with KaTeX
- Implement session management

See `_docs/actionable/tasks.md` for detailed task list.

