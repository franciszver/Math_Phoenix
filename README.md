# Math_Phoenix
[![CI](https://github.com/franciszver/Math_Phoenix/actions/workflows/ci.yml/badge.svg)](https://github.com/franciszver/Math_Phoenix/actions/workflows/ci.yml)

A **K-12 Socratic math tutor** — a web app where students submit a math problem (typed or photographed) and work through it in a guided chat.  
The AI tutor never gives the answer; it asks one guiding question at a time, offers hints after two stuck turns, detects when the student reaches the solution, and follows up with a short multiple-choice quiz.  
A password-protected **teacher dashboard** shows transcripts and stats.  
Demo application: near-zero traffic, zero infrastructure budget.

---

## 🏗️ Architecture

Stack: React/Vite static frontend + Node/Express (ESM) backend on Render (render.yaml Blueprint, auto-deploy on push to main). No other infrastructure by design.

**AI layer** — OpenRouter free tier: all LLM traffic flows through one choke point, `createChatCompletion` in backend/src/services/openai.js (OpenAI SDK pointed at OpenRouter). Models are pure env config (TEXT_MODEL=openai/gpt-oss-20b:free, VISION_MODEL=google/gemma-4-31b-it:free, plus fallbacks) — a model swap is a dashboard edit, not a code change. The wrapper absorbs free-tier reality: retry-once-with-fallback on 429/5xx, OpenRouter in-band {error} bodies, and empty completions (reasoning models can exhaust max_tokens on hidden thinking); SDK-internal retries disabled for fast degradation. ~19 call sites (Socratic dialogue, classifiers, JSON extractors, MC generation, vision OCR) ride this wrapper.

**Storage** — deliberately ephemeral: sessions/transcripts/dashboard data in an in-memory Map (memoryStore.js, structuredClone isolation); images processed in memory (base64 → vision OCR → discarded). Restarts wipe state — explicit tradeoff for zero cost/ops.

**Design principle:** assume the AI substrate is unreliable and make that survivable — fallback chains, fail-fast timeouts, graceful error surfaces, deterministic fast-paths (bare expressions like 1+2 validate by regex, never an LLM coin-flip).

---

## 🔬 Testing

Math_Phoenix uses three layers of testing:

1. **Unit tests** (~164 node:test tests, zero deps) — LLM stubbed via an injection seam; verify parsing, fallback/retry, store semantics; run on every change.

2. **Review gates** — every branch passes simplify/security-review/code-review before merge; these caught real bugs pre-ship (silent result truncation, infra noise contaminating quality metrics, completion-semantics drift).

3. **Evals** — measurement against real-world model behavior. See the [Evals](#-evals) section below for full details.

**Proof it works:** In its first day, the evaluation suite vetoed a planned 120B-model 'upgrade' with data (it lost or tied every behavior vs the current 20B, including −17.5 points on math-problem detection) and found two genuine prompt defects, both tracked with a measurement plan.

---

## 🌐 Deployment

**Want to host Math Phoenix for others to use?**

- **Quick Start**: See [QUICKSTART.md](QUICKSTART.md) for fastest deployment (15-30 minutes)
- **Detailed Guide**: See [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive deployment options
- **Checklist**: Use [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) to ensure nothing is missed

**Deployment Options:**
- 🎯 **Render** (Easiest) - One-click deployment with Blueprint
- 🚀 **Railway + Vercel** - Great performance, easy setup
- 🐳 **Docker** - Self-hosting option

---

## 🚀 Getting Started (Local Development)

### Prerequisites
- Node.js (>= 18.x recommended)
- npm (comes with Node.js)
- OpenRouter API key (get one at https://openrouter.ai/keys)
  - Enable data logging for free models in Settings → Privacy
  - Purchase one-time $10 credit to unlock 1,000 req/day (optional for demo)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd Math_Phoenix
   ```

2. Install dependencies:
   ```bash
   # Install backend dependencies
   cd backend
   npm install

   # Install frontend dependencies
   cd ../frontend
   npm install
   ```

3. Set up environment variables:
   ```bash
   # Copy the example file and fill in your values
   cp .env.example .env
   # Edit .env and add your OPENROUTER_API_KEY
   ```

4. Start development servers:
   ```bash
   # Terminal 1: Start backend
   cd backend
   npm run dev

   # Terminal 2: Start frontend
   cd frontend
   npm run dev
   ```

---

## 📁 Project Structure

```
Math_Phoenix/
├── frontend/          # Vite + React frontend
├── backend/           # Express backend (Lambda-ready)
├── infrastructure/    # AWS infrastructure as code
├── scripts/           # Utility scripts
└── _docs/             # Documentation
```

---

## 🛠️ Development

- **Frontend**: Vite + React (runs on http://localhost:5173 by default)
- **Backend**: Express (runs on http://localhost:3001 by default)

## 📡 API Endpoints

### Sessions
- `GET /api/sessions/:code` - Get session details
- `POST /api/sessions` - Create or get existing session

### Problems
- `POST /api/sessions/:code/problems` - Submit problem (text or image)
  - Body: `{ text: "problem text" }` or multipart form with `image` file
  - Returns: Session code, problem ID, tutor message, problem info

### Chat
- `POST /api/sessions/:code/chat` - Send message in conversation
  - Body: `{ message: "student response" }`
  - Returns: Tutor response, conversation context

## 🔍 Image Verification System

**Feature:** Automatic verification and correction of image-based math problems.

**How it works:**
- When a student uploads an image, the system extracts text using OCR via OpenRouter Vision API
- The OCR confidence score is stored with the problem (0-1 scale)
- For problems with low OCR confidence (< 0.8 or missing), the system automatically verifies the problem text against the image after every tutor response
- If a mismatch is detected (e.g., "1+1" was read instead of "1+12"), the system:
  1. Automatically corrects the problem text
  2. Re-processes the problem (updates LaTeX, category, difficulty)
  3. Re-generates the tutor response with a natural correction acknowledgment
  4. Updates the session with the corrected problem

**Benefits:**
- **Redundancy**: Catches OCR errors that might have been missed initially
- **Accuracy**: Ensures students work with the correct problem throughout the session
- **Seamless UX**: Corrections are acknowledged naturally by the tutor without disrupting the conversation flow
- **Smart Optimization**: Only verifies when OCR confidence is low, reducing unnecessary API calls

**Verification Conditions:**
- Only runs for image-based problems (has `image_key`)
- Only verifies if the problem is still active (student hasn't moved to a new problem)
- Skips verification if OCR confidence is high (≥ 0.8), saving API costs
- Gracefully degrades on errors (verification failures don't break the conversation)

**Example:** If OCR reads "1+1" with low confidence, verification after the first tutor response catches the error and corrects it to "1+12", allowing the tutor to guide the student with the correct problem.

## 📊 Phase 3: Monitoring & ML Data Collection

### CloudWatch-Ready Logging & Metrics

**Approach:** Structured logging with CloudWatch-ready JSON output in production.

**Why:** 
- **Development**: Human-readable console logs for debugging
- **Production**: JSON-structured logs automatically ingested by CloudWatch Logs
- **Metrics**: Embedded metric events for CloudWatch Metrics (via log parsing or direct API)

**Implementation:**
- Enhanced logger outputs structured JSON in production mode
- OCR/Vision performance metrics tracked:
  - Success/failure rates
  - Confidence scores
  - Latency (milliseconds)
- All metrics include dimensions (environment) for filtering

**Metrics Tracked:**
- `OCR.Attempt` - Total OCR attempts
- `OCR.Success` / `OCR.Failure` - Success/failure counts
- `OCR.Confidence` - Average confidence scores
- `OCR.Latency` - Processing time
- `OCR.Pipeline.Success` - Overall pipeline success rate

**Note:** Currently logs to console (structured JSON in production). Full metrics integration can be added during deployment to platforms like Render or AWS CloudWatch.

### ML Data Collection for Future Difficulty Classifier

**Status:** Planned for Phase 6+ (persistent storage phase)

**Approach:** Real-time collection of structured training data for ML classifier development.

**Why:**
- **Real-time Collection**: Capture data immediately when problems are submitted (accuracy)
- **Teacher Feedback**: Teacher overrides are valuable training signals (mark as `teacher_override: true`)
- **Feature Engineering**: Extract structured features (operation counts, complexity indicators) for ML training
- **Non-blocking**: Collection happens asynchronously - doesn't impact user experience

**Data to Collect:**
- **Problem Features**: Text length, operation counts, variable counts, number features, complexity indicators
- **Category Features**: One-hot encoded categories (arithmetic, algebra, geometry, word, multi-step)
- **Student Performance**: Hints used, steps taken, completion status
- **OCR Metadata**: Confidence, success status (for image problems)
- **Teacher Corrections**: When teachers manually override tags (valuable training signal)

**Future Use:**
- Train ML classifier to replace rule-based difficulty classification
- Analyze patterns in teacher corrections to improve auto-tagging
- Build confidence scores based on historical performance data

**Note:** Currently, data is stored in-memory and resets on restart (demo design). Persistent storage will be implemented in a later phase with database configuration.

## 👥 Teacher-Student Collaboration Feature

**Feature:** Real-time collaboration workspace for teachers to help students with low confidence.

**How it works:**
- Teachers can see students with confidence < 1.0 in the dashboard
- Teacher clicks "Help Student" button on a problem card
- System presents 3 similar problems using hybrid approach:
  - **Embedding-based similarity**: Finds similar problems from database using OpenAI embeddings
  - **LLM generation**: Generates new similar problems if database has few matches
  - Teacher selects one problem to work on
- Teacher and student join a collaboration workspace with:
  - **Chat window**: Real-time messaging (polling-based, 2-3 second intervals)
  - **Drawing canvas**: Shared whiteboard using Fabric.js with pen, shapes, and basic tools
  - **Teacher controls**: Can enable/disable student drawing permission
- Student session is blocked until they join the collaboration
- Collaboration sessions stored in-memory (resets on restart — demo design)

**Problem Similarity Matching:**
- Uses hybrid approach: OpenRouter embeddings + LLM generation
- Embeddings generated on-demand (lazy loading)
- Similarity scores shown for database matches
- LLM-generated problems labeled as "Generated"
- **Future enhancement**: Expand problem database with Kaggle/GSM8K datasets for better similarity matching

**Technical Details:**
- **Drawing Technology**: HTML5 Canvas with Fabric.js (pen + basic shapes)
- **Real-time Updates**: Polling (2-3 second intervals) - simpler than WebSocket for turn-taking
- **Canvas Sync**: Debounced updates (1-2 seconds after drawing stops)
- **Storage**: In-memory with session-based cleanup (resets on restart)
- **Access**: Both teacher and student can access via `/collaboration/:collabSessionId` route

**API Endpoints:**
- `GET /api/dashboard/sessions/:studentSessionId/similar-problems` - Get similar problems
- `POST /api/dashboard/sessions/:studentSessionId/collaboration/start` - Start collaboration
- `GET /api/collaboration/:collabSessionId` - Get collaboration details
- `POST /api/collaboration/:collabSessionId/message` - Send chat message
- `POST /api/collaboration/:collabSessionId/canvas` - Update canvas state
- `GET /api/collaboration/:collabSessionId/updates` - Poll for updates
- `PUT /api/collaboration/:collabSessionId/drawing-permission` - Toggle drawing permission
- `POST /api/collaboration/:collabSessionId/end` - End collaboration

---

## 🔒 Rate Limiting

Rate limiting is deferred to Phase 3. See `_docs/actionable/tasks.md` for details.

---

## 🧪 Evals

**Purpose:** Math_Phoenix uses golden-dataset and LLM-as-judge evaluations to measure the real service pipeline (prompts + parsing + fallback) against OpenRouter free-tier models. Evals enable:
- **Regression detection** when free models rotate or availability changes
- **Objective model comparison** across candidate models
- **Prompt-change measurement** to validate improvements

**Evaluation Suites** (all commands from `backend/`):

- `npm run eval:classifiers` — Test 7 classifier behaviors against ~190 golden cases; report accuracy vs per-behavior thresholds
- `npm run eval:tutor` — Measure Socratic tutor quality via cross-family LLM judge:
  - Hard gate: never reveals the answer
  - Soft checks: guiding question quality, appropriate tone, single-number rule
  - Plus MCQ, transfer, and similar-shape problem checks
- `npm run eval:e2e` — Run scripted student conversation simulations (4 personas) with deterministic flow assertions
- `npm run eval:models -- --models a,b` — Run suites across candidate models (default: classifiers; add `--suites classifiers,tutor`); produces a merged comparison table

**Common Flags:**
- `--dry-run` — Display call budget and exit (zero API calls)
- `--limit` — Limit dataset size
- `--filter` — Run subset of evals by name
- `--rpm` — Set request rate (default 15 req/min)
- `--resume <run-id>` — Resume interrupted run
- `--yes` — Skip prompts

**Quota & Rate Limits:**
All evals share the production OpenRouter API key. Free tier: 20 req/min, 1,000 req/day. Always `--dry-run` first to check call budget. Runs are resumable after quota exhaustion (exit code 2 prints the resume command).

**Layout:** Eval assets live in `backend/evals/`:
- `datasets/` — Golden-case datasets
- `runners/` — Eval suite implementations
- `reports/` (gitignored) — Run outputs and logs
- `BASELINES.md` — Committed baseline summaries; investigate any >10-point regression

**Judge Calibration:** Judge verdicts were validated against 11 human labels (100% agreement) before deployment.

---

## 📚 Documentation

See `_docs/` for detailed documentation:
- `actionable/prd.md` - Product Requirements Document
- `actionable/architecture_mvp.md` - Architecture overview
- `actionable/tasks.md` - Implementation tasks

---

## 🔐 Environment Variables

Required environment variables (see `.env.example`):
- `OPENROUTER_API_KEY` - OpenRouter API key (get at https://openrouter.ai/keys)
- `TEXT_MODEL` - Text generation model (optional, default: `openai/gpt-oss-20b:free`)
- `VISION_MODEL` - Vision/image model (optional, default: `google/gemma-4-31b-it:free`)
- `TEXT_MODEL_FALLBACK` - Fallback text model (optional, default: `meta-llama/llama-3.3-70b-instruct:free`)
- `VISION_MODEL_FALLBACK` - Fallback vision model (optional, default: `nvidia/nemotron-nano-12b-v2-vl:free`)
- `SESSION_SECRET` - Secret for session code generation
- `DASHBOARD_PASSWORD` - Password for teacher dashboard

