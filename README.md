# Math_Phoenix

An **AI-powered math tutor** that guides K‑12 students through problems using **Socratic questioning**.  
Math_Phoenix accepts problems via **text or image upload**, normalizes math into LaTeX, and helps students discover solutions through guided dialogue.  
It also provides a **teacher dashboard** with aggregate and per‑session insights.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (>= 18.x recommended)
- npm (comes with Node.js)
- AWS account with:
  - S3 bucket
  - Textract enabled
  - DynamoDB tables:
    - `math-phoenix-sessions` (with TTL for 30‑day expiration)
    - `math-phoenix-ml-data` (optional, for ML data collection)
- OpenAI API key (with access to GPT + Vision endpoints)

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
   # Edit .env with your actual credentials
   ```

4. Set up AWS resources:
   ```bash
   # See infrastructure/README.md for setup instructions
   cd infrastructure
   # Follow the setup guide
   ```

5. Start development servers:
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

### Generating Demo Data

To populate the teacher dashboard with realistic demo data for presentations or testing:

```bash
cd backend
npm run generate-demo-data
```

**Options:**
- `--count=N` - Number of sessions to generate (default: 20)
- `--clear` - Clear existing data before generating (optional)
- `--days=N` - Number of days to spread sessions over (default: 7)

**Examples:**
```bash
# Generate 20 sessions spread over 7 days (default)
npm run generate-demo-data

# Generate 30 sessions, clear existing data first
npm run generate-demo-data -- --count=30 --clear

# Generate 15 sessions spread over 14 days
npm run generate-demo-data -- --count=15 --days=14
```

**What it generates:**
- Multiple sessions with varied creation dates
- 1-5 problems per session across all categories (arithmetic, algebra, geometry, word, multi-step)
- Realistic conversation flows with 2-8 steps per problem
- Proper hint usage tracking and streak meter data
- Transcript entries for each conversation turn
- Mix of completed and in-progress problems

**Note:** Requires AWS credentials and DynamoDB table to be configured. The script uses the same AWS configuration as the main application.

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
- When a student uploads an image, the system extracts text using OCR (Textract → Vision fallback)
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
  - Success/failure rates by source (Textract vs Vision)
  - Confidence scores
  - Latency (milliseconds)
  - Fallback frequency
- All metrics include dimensions (source, environment) for filtering

**Metrics Tracked:**
- `OCR.Attempt` - Total OCR attempts
- `OCR.Success` / `OCR.Failure` - Success/failure counts
- `OCR.Confidence` - Average confidence scores
- `OCR.Latency` - Processing time
- `OCR.Fallback` - Textract → Vision fallback events
- `OCR.Pipeline.Success` - Overall pipeline success rate

**Note:** CloudWatch integration requires AWS IAM permissions and CloudWatch Logs/Metrics configuration. Currently logs to console/CloudWatch Logs (structured JSON). Full CloudWatch Metrics integration can be added later.

### ML Data Collection for Future Difficulty Classifier

**Approach:** Real-time collection of structured training data in separate DynamoDB table.

**Why:**
- **Separate Storage**: ML data persisted independently from session data (different retention needs)
- **Real-time Collection**: Capture data immediately when problems are submitted (accuracy)
- **Teacher Feedback**: Teacher overrides are valuable training signals (mark as `teacher_override: true`)
- **Feature Engineering**: Extract structured features (operation counts, complexity indicators) for ML training
- **Non-blocking**: Collection happens asynchronously - doesn't impact user experience

**Data Collected:**
- **Problem Features**: Text length, operation counts, variable counts, number features, complexity indicators
- **Category Features**: One-hot encoded categories (arithmetic, algebra, geometry, word, multi-step)
- **Student Performance**: Hints used, steps taken, completion status
- **OCR Metadata**: Source, confidence, success status (for image problems)
- **Teacher Corrections**: When teachers manually override tags (valuable training signal)

**Storage:**
- **Table**: `math-phoenix-ml-data` (separate from session table)
- **Structure**: 
  - `record_id`: Unique identifier
  - `raw_data`: Original problem data (flexibility)
  - `features`: Extracted feature vector (ML-ready)
  - `metadata`: Collection metadata (teacher override, OCR info, timestamps)

**Future Use:**
- Train ML classifier to replace rule-based difficulty classification
- Analyze patterns in teacher corrections to improve auto-tagging
- Build confidence scores based on historical performance data

**Note:** ML data table creation is handled via infrastructure scripts. Collection is non-critical (errors logged but don't fail requests).

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
- Collaboration sessions stored in DynamoDB with 30-day TTL

**Problem Similarity Matching:**
- Uses hybrid approach: OpenAI embeddings (`text-embedding-3-small`) + LLM generation
- Embeddings generated on-demand (lazy loading)
- Similarity scores shown for database matches
- LLM-generated problems labeled as "Generated"
- **Future enhancement**: Expand problem database with Kaggle/GSM8K datasets for better similarity matching

**Technical Details:**
- **Drawing Technology**: HTML5 Canvas with Fabric.js (pen + basic shapes)
- **Real-time Updates**: Polling (2-3 second intervals) - simpler than WebSocket for turn-taking
- **Canvas Sync**: Debounced updates (1-2 seconds after drawing stops)
- **Storage**: Same DynamoDB table with 30-day TTL
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

## 📚 Documentation

See `_docs/` for detailed documentation:
- `actionable/prd.md` - Product Requirements Document
- `actionable/architecture_mvp.md` - Architecture overview
- `actionable/tasks.md` - Implementation tasks

---

## 🔐 Environment Variables

Required environment variables (see `.env.example`):
- `OPENAI_API_KEY` - OpenAI API key
- `AWS_ACCESS_KEY_ID` - AWS access key (optional if using default profile)
- `AWS_SECRET_ACCESS_KEY` - AWS secret key (optional if using default profile)
- `AWS_REGION` - AWS region (e.g., us-east-1)
- `SESSION_SECRET` - Secret for session code generation
- `DASHBOARD_PASSWORD` - Password for teacher dashboard
- `S3_BUCKET_NAME` - S3 bucket name for image uploads
- `DYNAMODB_TABLE_NAME` - DynamoDB table name for sessions (default: `math-phoenix-sessions`)
- `DYNAMODB_ML_TABLE_NAME` - DynamoDB table name for ML data (optional, default: `math-phoenix-ml-data`)
- `CLOUDFRONT_URL` - CloudFront distribution URL for frontend (optional, default: `https://d3rfhzm2ptw0c2.cloudfront.net`)

