# Math Phoenix - Features Documentation

## Overview

Math Phoenix is an AI-powered math tutoring system that guides K-12 students through problems using Socratic questioning. The system accepts problems via text or image upload, normalizes math into LaTeX, and helps students discover solutions through guided dialogue. It provides comprehensive analytics for teachers through a password-protected dashboard.

---

## Implemented Features

### Core System Features

1. **Problem Input System**
   - Text entry for typed problems
   - Image upload with OCR processing (PNG/JPG)
   - Multiple problem detection from single image
   - Problem selection interface when multiple problems detected

2. **OCR Processing Pipeline**
   - AWS Textract as primary OCR engine
   - OpenAI Vision API as automatic fallback
   - OCR confidence tracking
   - Image verification system for error detection and correction

3. **Problem Processing**
   - LaTeX normalization for equations
   - Automatic categorization (arithmetic, algebra, geometry, word problems, multi-step)
   - Rule-based difficulty classification (easy, medium, hard)
   - Problem metadata storage (category, difficulty, OCR confidence)

4. **Socratic Dialogue Engine**
   - Multi-turn conversation flow with context retention
   - Never provides direct answers - uses guiding questions
   - Adaptive hint system (triggers after 2+ stuck turns)
   - Progress tracking and analysis
   - Encouraging, adaptive tone

5. **Session Management**
   - 6-character alphanumeric session codes
   - School code authentication (required for all operations)
   - 30-day session expiration (DynamoDB TTL)
   - Session resume capability
   - Transcript storage with structured steps

6. **Math Rendering**
   - KaTeX integration for equation rendering
   - Real-time LaTeX display in chat messages
   - Visual equation formatting

7. **Analytics & Data Collection**
   - ML data collection for future classifier training
   - OCR/Vision performance metrics tracking
   - CloudWatch-ready structured logging
   - Feature extraction (30+ features per problem)

8. **Image Verification System**
   - Automatic OCR error detection
   - Problem text correction when errors detected
   - Natural correction acknowledgment by tutor
   - Optimized verification (only runs for low-confidence OCR results)

9. **Streak Meter System**
   - Visual progress meter (0-100%)
   - Increases by 20% per progress step
   - Resets to 0% when hint is used
   - Completes at 100% with celebration
   - Tracks streak completions

10. **Learning Assessment**
    - Multiple-choice quiz about problem-solving approach
    - Transfer problem to test independent application
    - Learning confidence score calculation
    - Assessment data stored and displayed in dashboard

11. **Teacher-Student Collaboration**
    - Real-time collaboration workspace
    - Shared drawing canvas with Fabric.js
    - Real-time chat messaging
    - Problem similarity matching (embeddings + LLM generation)
    - Teacher controls (enable/disable student drawing)

12. **Teacher Dashboard**
    - Password-protected access
    - Aggregate statistics view
    - Per-session detailed view
    - Problem tag editing (category/difficulty override)
    - Learning assessment insights
    - Collaboration initiation
    - Session deletion

---

## Student Functionality

### Problem Submission

**Text Entry:**
- Students can type math problems directly into the chat interface
- Problems are immediately processed and normalized to LaTeX
- Categories and difficulty are automatically assigned

**Image Upload:**
- Upload images containing math problems (PNG/JPG formats)
- Support for drag-and-drop or click-to-upload
- Automatic OCR processing extracts text from images
- Multiple problems detected automatically; students select which to work on

**Multiple Problem Selection:**
- When an image contains multiple problems, a selection modal appears
- Students can review all detected problems
- Select one problem to focus on for the tutoring session

### Tutoring Session

**Socratic Dialogue:**
- Interactive chat interface with the AI tutor
- Tutor asks guiding questions (never provides direct answers)
- Students respond naturally in the conversation
- Multi-turn context retention throughout the session

**Progress Tracking:**
- System tracks student progress through each step
- Progress is detected based on student responses
- Hints are provided automatically when student is stuck (after 2+ turns)

**Streak Meter:**
- Visual progress meter displayed in the chat interface
- Increases by 20% when student makes progress without hints
- Resets to 0% when a hint is used
- Celebrates when reaching 100% (completes streak)
- Provides encouraging feedback at milestones (20%, 40%, 60%, 80%)

**Learning Assessment:**
- After completing a problem, students take a multiple-choice quiz
- Quiz tests understanding of the problem-solving approach used
- 2-3 questions appear one at a time
- After quiz, students attempt a transfer problem (similar problem with different numbers)
- Tests if students can apply the approach independently

**Image Verification:**
- Automatic background verification for image-based problems
- OCR errors are detected and corrected automatically
- Tutor acknowledges corrections naturally without disrupting flow
- Only runs for low-confidence OCR results (optimization)

### Session Management

**Session Creation:**
- Students create new sessions with a school code
- Session code is generated automatically (6 characters)
- Session code is displayed and can be saved for later

**Session Resume:**
- Students can resume previous sessions using session code + school code
- All previous messages and progress are restored
- Can continue where they left off

**Consent:**
- Consent popup appears at first session start
- Students must accept consent to use the system
- Consent message explains data collection and teacher access

### Collaboration Access

**Collaboration Invitation:**
- When a teacher initiates collaboration, student sees a blocking modal
- Modal indicates teacher wants to help
- Student can click link to join collaboration workspace

**Collaboration Workspace:**
- Real-time shared workspace with teacher
- Chat window for messaging
- Drawing canvas for visual work
- Can draw, use shapes, and collaborate visually
- Teacher can control drawing permissions

---

## Teacher Functionality

### Dashboard Access

**Login:**
- Password-protected dashboard (single shared password)
- Access via `/dashboard` route
- Token-based authentication
- No persistent login (always requires password on new visit)

### Aggregate View

**Overall Statistics:**
- Total number of sessions
- Total problems attempted across all sessions
- Total hints used
- Average problems per session
- Average hints per session

**Category Distribution:**
- Breakdown of problems by category (arithmetic, algebra, geometry, word, multi-step)
- Visual pie chart showing category distribution
- Percentage and count for each category

**Difficulty Distribution:**
- Breakdown of problems by difficulty (easy, medium, hard, unknown)
- Visual pie chart showing difficulty distribution
- Zero values explicitly called out

**Learning Assessment Metrics:**
- Average learning confidence score across all sessions
- Breakdown by confidence level (high ≥0.8, medium 0.5-0.79, low <0.5)
- MC quiz performance statistics
- Transfer problem success rate
- Students who failed assessment (need attention)

### Per-Session View

**Session List:**
- List of all sessions with key information
- Session code, creation date, problem count, hints used
- Search functionality to find specific sessions
- Click to view detailed session information

**Session Details:**
- Complete session information
- List of all problems in the session
- For each problem:
  - Problem text and LaTeX
  - Category and difficulty (editable)
  - Hints used count
  - Steps taken
  - Completion status
  - Learning assessment data (if available)

**Problem Tag Editing:**
- Teachers can edit problem category
- Teachers can edit problem difficulty
- Changes are saved immediately
- Teacher overrides are tracked for ML training

**Learning Assessment Insights:**
- Per-problem learning confidence scores
- MC quiz results (score and individual question results)
- Transfer problem success/failure
- Color-coded confidence indicators (high/medium/low)
- Expandable views showing MC questions and student answers
- Transfer problem details

**Student Support:**
- Identify students with low confidence (< 1.0)
- "Help Student" button on problem cards for low-confidence students
- Initiate collaboration sessions with students who need help

### Collaboration Features

**Similar Problem Generation:**
- When teacher clicks "Help Student", system presents 3 similar problems
- Hybrid approach: embedding-based similarity + LLM generation
- Shows similarity scores for database matches
- Teacher selects problem to work on

**Collaboration Workspace:**
- Real-time shared workspace with student
- Chat window for messaging (both teacher and student)
- Drawing canvas with Fabric.js (pen, shapes, basic tools)
- Teacher controls: enable/disable student drawing permission
- Real-time synchronization (polling-based, 2-3 second intervals)
- Canvas state synchronized when drawing stops

**Collaboration Management:**
- Start collaboration session
- End collaboration session
- Access collaboration via `/collaboration/:collabSessionId` route

### Session Management

**Session Deletion:**
- Teachers can delete sessions from the dashboard
- Confirmation dialog before deletion
- Permanent deletion (cannot be undone)

**Session Navigation:**
- Navigate from aggregate view to specific session
- Click on session metrics to view details
- Return to aggregate view from session details

---

## Technical Features

### Backend Services

**Problem Processing Service:**
- Handles problem submission and processing
- LaTeX normalization
- Category and difficulty classification
- Multiple problem detection

**Socratic Engine:**
- Generates tutor responses using OpenAI LLM
- Analyzes student progress
- Determines when to provide hints
- Tracks conversation context

**Session Service:**
- Manages session creation and retrieval
- Handles session expiration
- Stores problem data and steps
- Manages streak meter updates

**Image Service:**
- Handles image uploads to S3
- OCR processing (Textract + Vision fallback)
- Image verification and correction
- OCR confidence tracking

**Learning Assessment Service:**
- Generates MC questions about problem-solving approach
- Generates transfer problems
- Calculates learning confidence scores
- Tracks assessment completion

**Collaboration Service:**
- Manages collaboration sessions
- Handles real-time updates (polling)
- Synchronizes canvas state
- Manages drawing permissions

**Problem Similarity Service:**
- Finds similar problems using OpenAI embeddings
- Generates new similar problems using LLM
- Hybrid approach for better matching

**Dashboard Service:**
- Aggregates statistics across all sessions
- Calculates learning assessment metrics
- Provides session details
- Handles problem tag updates

**ML Data Service:**
- Collects structured training data
- Extracts 30+ features per problem
- Tracks teacher overrides
- Stores in separate DynamoDB table

**Metrics Service:**
- Tracks OCR/Vision performance
- Logs success/failure rates
- Records confidence scores and latency
- CloudWatch-ready structured logging

### Frontend Components

**Student Interface:**
- ConsentPopup - Initial consent dialog
- SessionEntry - Session creation/resume
- Chat - Main tutoring interface
- ChatMessage - Message display with KaTeX
- ChatInput - Text input for responses
- ProblemInput - Problem submission (text/image)
- ProblemSelection - Multiple problem selection modal
- StreakMeter - Visual progress meter
- MCQuestion - Multiple-choice quiz interface
- TransferProblem - Transfer problem interface
- CollaborationBlockingModal - Collaboration invitation modal
- CollaborationWorkspace - Collaboration interface

**Teacher Interface:**
- DashboardLogin - Password authentication
- Dashboard - Main dashboard with view toggle
- AggregateView - Overall statistics display
- SessionListView - Per-session view with details
- SimilarProblemsModal - Similar problem selection
- CollaborationWorkspace - Collaboration interface (teacher side)

### Data Storage

**DynamoDB Tables:**
- `math-phoenix-sessions` - Session data with 30-day TTL
- `math-phoenix-ml-data` - ML training data (separate table)

**S3 Bucket:**
- Image storage for uploaded problem images
- Images stored with unique keys
- CloudFront CDN for image delivery (optional)

### API Endpoints

**Sessions:**
- `GET /api/sessions/:code` - Get session details
- `POST /api/sessions` - Create or get existing session

**Problems:**
- `POST /api/sessions/:code/problems` - Submit problem (text or image)
- `POST /api/sessions/:code/problems/select` - Select problem from multiple options

**Chat:**
- `POST /api/sessions/:code/chat` - Send message in conversation
- `POST /api/sessions/:code/assessment/mc-answer` - Answer MC question
- `POST /api/sessions/:code/assessment/transfer` - Submit transfer problem answer

**Dashboard:**
- `POST /api/dashboard/login` - Teacher dashboard login
- `GET /api/dashboard/stats` - Get aggregate statistics
- `GET /api/dashboard/sessions` - Get all sessions
- `GET /api/dashboard/sessions/:code` - Get session details
- `PUT /api/dashboard/sessions/:code/problems/:problemId/tags` - Update problem tags
- `DELETE /api/dashboard/sessions/:code` - Delete session

**Collaboration:**
- `GET /api/dashboard/sessions/:studentSessionId/similar-problems` - Get similar problems
- `POST /api/dashboard/sessions/:studentSessionId/collaboration/start` - Start collaboration
- `GET /api/collaboration/:collabSessionId` - Get collaboration details
- `POST /api/collaboration/:collabSessionId/message` - Send chat message
- `POST /api/collaboration/:collabSessionId/canvas` - Update canvas state
- `GET /api/collaboration/:collabSessionId/updates` - Poll for updates
- `PUT /api/collaboration/:collabSessionId/drawing-permission` - Toggle drawing permission
- `POST /api/collaboration/:collabSessionId/end` - End collaboration

---

## Feature Documentation References

For detailed implementation information, see:
- `_docs/executed/prd.md` - Product Requirements Document
- `_docs/executed/tasks.md` - Implementation tasks and status
- `_docs/executed/streak-update-pathway.md` - Streak meter implementation details
- `_docs/executed/image-verification-system.plan.md` - Image verification system details
- `_docs/executed/concept-learning-assessment.plan.md` - Learning assessment implementation
- `_docs/executed/teacher-student-collaboration-feature.plan.md` - Collaboration feature details
- `_docs/executed/generate-demo-data-script.plan.md` - Demo data generation script
- `_docs/executed/TEST_SCENARIOS.md` - Comprehensive test scenarios
- `README.md` - Main project documentation

---

## Future Enhancements

Features planned for future implementation (not currently in MVP):
- Step visualization animations
- Voice interface (speech-to-text + text-to-speech)
- ML-based difficulty classification (replacing rule-based)
- Animated tutor avatar
- Difficulty modes (grade-level scaffolding)
- Problem generation for practice sets

