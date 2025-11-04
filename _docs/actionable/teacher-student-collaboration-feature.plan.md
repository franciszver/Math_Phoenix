<!-- 10c76c0c-294d-44e4-a7b1-400cb6651b03 667f5bdb-29e9-4e08-a095-2f02c154f098 -->
# Teacher-Student Collaboration Feature Implementation Plan

## Overview

Implement a collaboration feature that allows teachers to help students with low confidence (< 1.0) through a shared workspace with chat and drawing capabilities. Teachers can find similar problems using hybrid embeddings + LLM approach, and students are blocked from continuing their session until they join the collaboration.

## Core Components

### 1. Problem Similarity Service (Hybrid Approach)

**File**: `backend/src/services/problemSimilarityService.js` (new)

**Implementation:**

- **Embedding-based similarity**: Use OpenAI `text-embedding-3-small` to generate embeddings for problems
- **Store embeddings**: Add `embedding` field to problem objects in DynamoDB (lazy generation on first access)
- **Similarity search**: Calculate cosine similarity between original problem and existing problems
- **LLM generation**: Use OpenAI to generate 1-2 new similar problems when database has few matches
- **Hybrid result**: Combine top similar problems from DB + LLM-generated problems, return top 3

**Functions:**

- `generateProblemEmbedding(problemText)` - Generate embedding using OpenAI API
- `findSimilarProblems(originalProblem, limit=2)` - Find similar problems using cosine similarity
- `generateSimilarProblems(originalProblem, count=2)` - Generate new similar problems via LLM
- `getSimilarProblemOptions(originalProblem)` - Hybrid function returning 3 options total

**Database changes:**

- Add `embedding: [number[]]` field to problem objects (optional, generated on-demand)
- Store embeddings for existing problems incrementally (when accessed or via batch job)

### 2. Collaboration Session Management

**File**: `backend/src/services/collaborationService.js` (new)

**Data Structure:**

```javascript
{
  collaboration_session_id: "COLLAB123",
  student_session_id: "ABC123",
  created_at: "2025-01-15T10:00:00Z",
  expires_at: 1736956800, // Unix timestamp (30 days TTL)
  problem_text: "2x + 5 = 13", // Similar problem selected by teacher
  selected_problem_id: "P001", // ID of original problem
  messages: [
    { speaker: "teacher", message: "Let's work through this...", timestamp: "...", canvas_update: null },
    { speaker: "student", message: "Okay", timestamp: "...", canvas_update: null }
  ],
  canvas_state: {...}, // Fabric.js JSON serialization
  student_can_draw: true, // Teacher-controlled flag
  status: "active" // active, completed, abandoned
}
```

**Functions:**

- `createCollaborationSession(studentSessionId, selectedProblemId, problemText)` - Create new collaboration
- `getCollaborationSession(collabSessionId)` - Retrieve collaboration session
- `addCollaborationMessage(collabSessionId, speaker, message, canvasState)` - Add chat message
- `updateCanvasState(collabSessionId, canvasState)` - Update drawing canvas
- `updateDrawingPermission(collabSessionId, studentCanDraw)` - Toggle student drawing
- `endCollaboration(collabSessionId)` - Mark collaboration as completed

**Storage:**

- Use same DynamoDB table: `math-phoenix-sessions` 
- Key: `collaboration_session_id` (new type of session)
- TTL: 30 days (same as regular sessions)

### 3. Collaboration API Endpoints

**File**: `backend/src/handlers/collaborationHandler.js` (new)

**Endpoints:**

- `POST /api/dashboard/sessions/:studentSessionId/collaboration/start` - Teacher starts collaboration
  - Body: `{ problemText: "...", selectedProblemId: "P001" }`
  - Returns: `{ collaboration_session_id, collaboration_url }`
- `GET /api/collaboration/:collabSessionId` - Get collaboration session details
- `POST /api/collaboration/:collabSessionId/message` - Send chat message
  - Body: `{ message: "...", speaker: "teacher"|"student" }`
- `POST /api/collaboration/:collabSessionId/canvas` - Update canvas state
  - Body: `{ canvasState: {...} }`
- `GET /api/collaboration/:collabSessionId/updates` - Polling endpoint for updates
  - Query: `?since=<timestamp>` - Get updates since timestamp
  - Returns: `{ messages: [...], canvasState: {...}, student_can_draw: true/false }`
- `PUT /api/collaboration/:collabSessionId/drawing-permission` - Toggle student drawing
  - Body: `{ student_can_draw: true/false }`
- `POST /api/collaboration/:collabSessionId/end` - End collaboration

**File**: `backend/src/handlers/dashboardHandler.js` (modify)

**New endpoint:**

- `GET /api/dashboard/sessions/:studentSessionId/similar-problems` - Get similar problems for "Help" button
  - Returns: `{ problems: [{ problemText: "...", similarity: 0.85 }, ...] }`

**Student session blocking:**

- `GET /api/sessions/:code` - Check for `collaboration_requested` flag
- `POST /api/sessions/:code/block-collaboration` - Set blocking flag when teacher starts collaboration

### 4. Teacher Dashboard Enhancements

**File**: `frontend/src/components/SessionListView.jsx` (modify)

**Changes:**

- Add "Help" button next to each problem card (only show if `learning_assessment.confidence < 1.0`)
- On click, show modal with 3 similar problem options
- Teacher selects one → navigates to collaboration workspace
- Pass collaboration session ID in URL: `/collaboration/:collabSessionId`

**File**: `frontend/src/components/SimilarProblemsModal.jsx` (new)

**Features:**

- Modal displaying 3 similar problems
- Each problem shows: problem text, similarity score (if from embeddings)
- "Select" button for each option
- Loading state while fetching similar problems

**File**: `frontend/src/services/api.js` (modify)

**New functions:**

- `getSimilarProblems(studentSessionId, problemId, token)` - Get similar problems
- `startCollaboration(studentSessionId, problemText, selectedProblemId, token)` - Start collaboration
- `getCollaborationSession(collabSessionId)` - Get collaboration details
- `sendCollaborationMessage(collabSessionId, message, speaker)` - Send chat message
- `updateCollaborationCanvas(collabSessionId, canvasState)` - Update canvas
- `pollCollaborationUpdates(collabSessionId, sinceTimestamp)` - Poll for updates
- `updateDrawingPermission(collabSessionId, studentCanDraw)` - Toggle permission
- `endCollaboration(collabSessionId)` - End collaboration

### 5. Collaboration Workspace Component

**File**: `frontend/src/components/CollaborationWorkspace.jsx` (new)

**File**: `frontend/src/components/CollaborationWorkspace.css` (new)

**Layout:**

- **Header**: Collaboration session ID, student session ID, "Leave" button
- **Left Panel (50%)**: Chat window
  - Message list (scrollable)
  - Input field at bottom
  - Shows speaker (teacher/student) with different styling
- **Right Panel (50%)**: Drawing canvas
  - Fabric.js canvas for drawing
  - Toolbar: pen, shapes, text, clear, undo/redo
  - Permission indicator (if student and drawing disabled)

**Features:**

- Polling: Check for updates every 2-3 seconds
- Canvas synchronization: Send canvas state updates to server
- Teacher controls: Toggle button to enable/disable student drawing
- Leave functionality: End collaboration and return to dashboard/student session

**File**: `frontend/src/components/CollaborationChat.jsx` (new)

**File**: `frontend/src/components/CollaborationCanvas.jsx` (new)

**Split into sub-components:**

- Chat component handles message display and input
- Canvas component handles Fabric.js integration and drawing tools

**Dependencies:**

- Install `fabric` package: `npm install fabric`
- Install `react-router-dom` if not already installed for routing

### 6. Student Session Blocking

**File**: `frontend/src/components/Chat.jsx` (modify)

**Changes:**

- Check for `collaboration_requested` flag when loading session
- If flag exists, show blocking modal overlay
- Modal displays: "Hey, a teacher wants to help! Come on over!" + link to collaboration
- Disable all inputs/buttons until student clicks link
- Link navigates to `/collaboration/:collabSessionId`

**File**: `frontend/src/components/CollaborationBlockingModal.jsx` (new)

**Features:**

- Full-screen overlay blocking UI
- Message: "Hey, a teacher wants to help! Come on over!"
- Button: "Join Collaboration Session"
- Redirects to collaboration workspace

**Backend changes:**

- `POST /api/dashboard/sessions/:studentSessionId/collaboration/start` - Set `collaboration_requested` flag on student session
- `GET /api/sessions/:code` - Return `collaboration_requested` and `collaboration_session_id` if exists

### 7. Route Configuration

**File**: `frontend/src/App.jsx` (modify)

**Add route:**

- `/collaboration/:collabSessionId` - Collaboration workspace (accessible by teacher and student)

**File**: `frontend/src/main.jsx` (check)

**Ensure React Router is configured**

### 8. README.md Updates

**Add section:**

- Teacher-Student Collaboration feature description
- Problem similarity matching (hybrid embeddings + LLM)
- Note about future ML training data (Kaggle, GSM8K) for improving similarity matching
- API endpoints documentation
- Canvas drawing capabilities

## Implementation Order

1. **Backend: Problem Similarity Service** (embeddings + LLM)
2. **Backend: Collaboration Service & API Endpoints**
3. **Backend: Dashboard handler for similar problems**
4. **Frontend: Similar Problems Modal**
5. **Frontend: Collaboration Workspace (chat + canvas)**
6. **Frontend: Student Session Blocking**
7. **Frontend: Teacher Dashboard Help Button Integration**
8. **Documentation Updates**

## Technical Decisions

- **Problem Similarity**: Hybrid embeddings (OpenAI) + LLM generation
- **Drawing Technology**: HTML5 Canvas with Fabric.js
- **Real-time Updates**: Polling (2-3 second intervals) - simpler than WebSocket for turn-taking
- **Storage**: Same DynamoDB table with 30-day TTL
- **Drawing Permission**: Teacher-controlled flag in collaboration session
- **Confidence Threshold**: < 1.0 (any student needing help)

## Future Enhancements

- Expand problem database with Kaggle/GSM8K datasets for better similarity matching
- Consider WebSocket upgrade if simultaneous editing is needed
- Add collaboration analytics/metrics
- Support multiple teachers per collaboration (if needed)

### To-dos

- [ ] Create problemSimilarityService.js with embedding generation, similarity search, and LLM problem generation
- [ ] Create collaborationService.js for managing collaboration sessions, messages, and canvas state
- [ ] Create collaborationHandler.js with API endpoints for collaboration operations
- [ ] Add similar problems endpoint to dashboardHandler.js and update server.js routes
- [ ] Create SimilarProblemsModal.jsx component for teacher to select similar problem
- [ ] Create CollaborationWorkspace.jsx with chat and canvas components using Fabric.js
- [ ] Implement student session blocking modal when teacher requests collaboration
- [ ] Add Help button to SessionListView.jsx problem cards and integrate with collaboration flow
- [ ] Add collaboration API functions to frontend/src/services/api.js
- [ ] Add collaboration route to App.jsx and ensure React Router is configured
- [ ] Update README.md with collaboration feature documentation and future ML training data note