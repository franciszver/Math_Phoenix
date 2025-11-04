<!-- cce131aa-ef73-4b1f-aaee-318eee579789 280b2464-d833-43ae-954b-195b4e655495 -->
# Learning Assessment with Dashboard Integration

## Overview

Implement multiple choice learning assessment (MC quiz + transfer problem) to measure if students learned the problem-solving approach, and integrate comprehensive learning assessment data into the teacher dashboard with actionable insights.

## Core Implementation

### 1. Solution Completion Detection

- **File**: `backend/src/services/socraticEngine.js`
- Detect when student provides final answer
- Use LLM to distinguish solution completion from intermediate steps
- Add `solution_completed` flag to step analysis

### 2. Learning Assessment Module

- **File**: `backend/src/services/learningAssessmentService.js` (new)
- Two-part assessment after solution completion:

**A. Multiple Choice Approach Quiz**

  - Generate 2-3 MC questions about the approach used
  - Questions test: method used, key steps, why approach works
  - Present one question at a time with 3-4 options
  - Score: 0-1 (`mc_score`: percentage correct)

**B. Transfer Problem**

  - Generate similar problem (same approach, different numbers)
  - Ask: "Now let's try a similar one: [transfer problem]"
  - Track if student applies approach independently
  - Score: 0-1 (`transfer_success`)

### 3. Learning Confidence Score

- **File**: `backend/src/services/learningAssessmentService.js`
- Formula: `learning_confidence = (mc_score * 0.6) + (transfer_success * 0.4)`
- Thresholds: High (≥0.8), Medium (0.5-0.79), Low (<0.5)

### 4. Data Storage

- **File**: `backend/src/services/sessionService.js`
- Store in problem object with MC questions, transfer problem, scores, and confidence

## Dashboard Integration - Detailed Suggestions

### Aggregate View Enhancements

1. **Learning Confidence Summary Card**

   - Display average learning confidence across all sessions
   - Color-coded: Green (≥0.8), Yellow (0.5-0.79), Red (<0.5)
   - Show breakdown by category with mini bar charts
   - Example: "Average Learning Confidence: 0.72 (Medium)" with breakdown

2. **Mastery Rate Display**

   - "42% of problems show mastery (confidence ≥0.8)"
   - Progress bar showing improvement over time
   - Filter by category (arithmetic, algebra, geometry, etc.)

3. **Completion vs. Learning Gap Alert**

   - "⚠️ 15% of completed problems show low learning confidence"
   - Red/yellow banner when gap is significant
   - Click to see list of problems with low confidence
   - Suggests students may need different teaching approach

4. **Transfer Problem Success Rate**

   - "Transfer problem success rate: 65%"
   - Shows if students can apply approaches independently
   - Flagged if success rate drops below 50%
   - Breakdown by category

5. **MC Question Performance Insights**

   - "Which MC questions are most missed?"
   - Heatmap showing question performance
   - Identifies common misconceptions
   - Suggests which teaching points need reinforcement

### Per-Session View Enhancements

1. **Problem-Level Learning Assessment**

   - Each problem shows:
     - Learning confidence score (0-1) with color indicator
     - MC quiz score (e.g., "2/3 correct")
     - Transfer problem result (✓ Pass / ✗ Needs help)
     - Expandable view showing MC questions and student answers

2. **MC Question Breakdown (Expandable)**

   - When expanded, shows:
     - Each MC question asked
     - Student's selected answer
     - Correct answer (highlighted green)
     - Visual indicator: ✓ correct, ✗ incorrect

3. **Transfer Problem Details (Expandable)**

   - Shows transfer problem text
   - Student's attempt
   - Whether solved independently or needed hints
   - Link to see full conversation for transfer problem

4. **Learning Confidence Trend**

   - Line chart showing confidence progression through session
   - Identifies if confidence improves or degrades over time
   - X-axis: Problem number, Y-axis: Confidence score

5. **Early Intervention Flags**

   - Red banner for sessions with average confidence <0.5
   - "⚠️ Student may need additional support"
   - Quick action button to review session details
   - Sortable/filterable list of flagged sessions

### Suggested Dashboard Layout

```
┌─────────────────────────────────────────────────────┐
│ Dashboard - Session: ABC123                         │
├─────────────────────────────────────────────────────┤
│ Learning Confidence: 0.72 ████████░░ (Medium)      │
│ Mastery Rate: 42% | Transfer Success: 65%          │
│ Completion Gap: 15% of completed show low confidence │
├─────────────────────────────────────────────────────┤
│ Problems:                                           │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Problem 1: 2x + 5 = 13                         │ │
│ │ Confidence: 0.85 ████████████ (High) ✓         │ │
│ │ MC Quiz: 3/3 correct | Transfer: ✓ Pass       │ │
│ │ [View Details ▼] [Expand MC Questions]         │ │
│ │   └─ MC Questions:                              │ │
│ │      ✓ "How did we solve?" → "Isolated variable"│ │
│ │      ✓ "What did we do first?" → "Subtracted 5" │ │
│ │      ✓ "Why this method?" → "To find x"         │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Problem 2: Area of rectangle                    │ │
│ │ Confidence: 0.45 ██████░░░░░░ (Low) ⚠️          │ │
│ │ MC Quiz: 1/3 correct | Transfer: ✗ Help       │ │
│ │ [View Details ▼] [Review Session]             │ │
│ │   └─ MC Questions:                              │ │
│ │      ✗ "How did we solve?" → "Added" (wrong)   │ │
│ │      ✓ "What did we do first?" → "Found length"│ │
│ │      ✗ "Why this method?" → "Guessed" (wrong)   │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Backend Dashboard Service Updates

- **File**: `backend/src/services/dashboardService.js`
- Add functions to calculate:
  - Average learning confidence per session and aggregate
  - MC question performance (which questions most missed)
  - Transfer problem success rate
  - Completion vs. learning gap percentage
  - Confidence trends over time
  - Early intervention flags (sessions with low confidence)

### Frontend Dashboard Component Updates

- **File**: `frontend/src/components/AggregateView.jsx`
- Add learning confidence summary cards
- Add MC question performance visualization
- Add transfer problem success rate display
- Add completion gap alert banner

- **File**: `frontend/src/components/SessionListView.jsx`
- Add learning confidence per problem
- Add expandable MC question breakdown
- Add transfer problem details
- Add confidence trend chart
- Add early intervention flag indicators

## Files to Create/Modify

1. **New**: `backend/src/services/learningAssessmentService.js`

   - Assessment functions (MC generation, transfer problem, confidence calculation)

2. **Modify**: `backend/src/services/socraticEngine.js`

   - Add solution completion detection

3. **Modify**: `backend/src/handlers/chatHandler.js`

   - Trigger assessment flow, handle MC answers

4. **Modify**: `backend/src/services/sessionService.js`

   - Add learning_assessment field to problem schema

5. **Modify**: `backend/src/services/dashboardService.js`

   - Add learning confidence metrics calculation
   - Add MC question performance analysis
   - Add transfer problem success tracking
   - Add early intervention detection

6. **Modify**: `frontend/src/components/AggregateView.jsx`

   - Display learning confidence summaries
   - Show MC question insights
   - Display transfer problem metrics

7. **Modify**: `frontend/src/components/SessionListView.jsx`

   - Show confidence per problem
   - Add expandable MC question views
   - Display transfer problem details
   - Add confidence trend visualization

## Success Criteria

- MC quiz and transfer problem assessments work correctly
- Learning confidence scores displayed in dashboard
- Teachers can identify students needing support
- MC question performance insights visible
- Transfer problem success tracked and displayed
- Completion vs. learning gap clearly visible
- Early intervention flags work

### To-dos

- [ ] Implement solution completion detection in socraticEngine.js
- [ ] Create learningAssessmentService.js with explanation and transfer problem assessment
- [ ] Implement learning confidence score calculation (explanation 40% + transfer 60%)
- [ ] Integrate assessment flow into chatHandler.js after solution completion
- [ ] Add learning_assessment field to problem schema in sessionService.js
- [ ] Implement adaptive practice recommendations based on confidence scores
- [ ] Add learning confidence metrics and analytics to dashboardService.js