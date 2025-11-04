<!-- fc1a3bfc-9b9d-4f8a-a063-2d4afab9ca15 f150697a-749f-4212-93f5-56ff29306c87 -->
# Generate Demo Data for Math_Phoenix Demo

## Overview

Create a script (`scripts/generate-demo-data.js`) that generates realistic demo data including multiple sessions with problems, steps, transcripts, and streak meter data to make the teacher dashboard look fully populated and used.

## Current Implementation Analysis

### Data Structures (from codebase)

- **Sessions**: `session_code`, `created_at` (ISO), `expires_at` (Unix timestamp), `problems[]`, `transcript[]`, `current_problem_id`, `streak_progress` (0-100), `streak_completions`, `streak_completed` (boolean flag)
- **Problems**: `problem_id` (P001, P002...), `raw_input`, `normalized_latex`, `category`, `difficulty` (very_easy|easy|medium|hard|very_hard), `steps[]`, `hints_used_total`, `completed` (boolean), `created_at`, optional `image_url`, `image_key`, `ocr_confidence`
- **Steps**: `step_number`, `tutor_prompt`, `student_response`, `hint_used` (boolean), `progress_made` (boolean), `stuck_turns` (number), `timestamp` (ISO)
- **Transcript**: `speaker` ('student'|'tutor'), `message`, `timestamp` (ISO)
- **Difficulty Mapping**: System uses `very_easy|easy|medium|hard|very_hard`, dashboard handles all values

## Implementation Plan

### 1. Create Demo Data Generation Script

**File**: `scripts/generate-demo-data.js`

The script will:

- Import existing services: `createSession`, `addProblemToSession`, `addStepToProblem`, `addToTranscript`, `updateSession` from `backend/src/services/sessionService.js`
- Import AWS clients from `backend/src/services/aws.js`
- Import `generateSessionCode` from `backend/src/utils/sessionCode.js`
- Import `processProblem` from `backend/src/services/problemService.js` (for proper categorization)
- Generate 15-25 sessions with varied creation dates (spread over last 7 days)
- Each session will have 1-5 problems with realistic data
- Problems will have varied categories (arithmetic, algebra, geometry, word, multi-step)
- Problems will have varied difficulties (using actual system values: very_easy, easy, medium, hard, very_hard)
- Each problem will have 2-8 steps with realistic tutor prompts and student responses
- Steps will properly track `hint_used`, `progress_made`, `stuck_turns`
- Streak meter will be calculated based on steps (progress_made adds 20%, hint_used resets to 0)
- Transcript entries will be generated for each step (student + tutor messages)
- Most problems will be completed (set `completed: true`, clear `current_problem_id`)
- Some problems will be in-progress (set `current_problem_id` to last problem)

### 2. Script Features

- Command-line arguments:
- `--count`: Number of sessions to generate (default: 20)
- `--clear`: Clear existing data before generating (default: false) - uses ScanCommand + DeleteCommand
- `--days`: Number of days to spread sessions over (default: 7)
- Uses existing service functions for proper data structure
- Error handling and progress logging
- Realistic conversation flows with natural Socratic dialogue patterns

### 3. Realistic Data Generation

- **Sample Problems** (by category):
- Arithmetic: "15 + 23 = ?", "45 × 6 = ?", "What is 144 ÷ 12?"
- Algebra: "2x + 5 = 13", "Solve for y: 3y - 7 = 14", "If x = 5, what is 2x + 3?"
- Geometry: "Find the area of a circle with radius 5", "What's the perimeter of a rectangle with length 8 and width 5?"
- Word: "If John has 15 apples and gives away 3, how many does he have left?", "A train travels 120 miles in 2 hours. What's its speed?"
- Multi-step: "Sarah has $50. She buys 3 books at $12 each. How much money does she have left?"
- **Step Generation Logic**:
- Initial step: tutor asks guiding question, student responds
- Progress steps: student shows understanding, tutor validates, progress_made = true
- Hint steps: after 2 stuck turns, tutor provides hint, hint_used = true
- Completion: student provides final answer, tutor validates, problem marked complete
- **Streak Meter Simulation**:
- Track streak_progress based on progress_made steps (each adds 20%)
- Reset to 0 when hint_used = true
- Complete streak (100%) increments streak_completions and resets progress
- Apply streak updates to session when problems are added

### 4. Integration

- Add npm script to `backend/package.json`: `"generate-demo-data": "node scripts/generate-demo-data.js"`
- Script should be runnable from backend directory: `cd backend && npm run generate-demo-data`
- Include comprehensive error handling and user-friendly output

### 5. Data Quality

- Ensure all required fields are present
- Match exact structure expected by dashboard service
- Use realistic timestamps (sequential within each session)
- Properly calculate hints_used_total from steps
- Set completed flag appropriately
- Generate natural tutor prompts (Socratic questioning style)
- Generate student responses that show learning progression

## Files to Create/Modify

- `scripts/generate-demo-data.js` - Main demo data generation script
- `backend/package.json` - Add npm script for running demo data generator

### To-dos

- [ ] Create scripts/generate-demo-data.js with DynamoDB integration, session generation, and realistic problem/step/transcript data
- [ ] Include realistic sample math problems across all categories (arithmetic, algebra, geometry, word, multi-step) with proper categorization
- [ ] Add npm script to backend/package.json for easy execution of demo data generator
- [ ] Implement --clear flag to optionally clear existing DynamoDB data before generating demo data