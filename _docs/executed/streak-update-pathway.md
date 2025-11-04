# Streak Update Pathway Documentation

## Overview
The streak system tracks student progress when they make forward progress without using hints. Each progress step adds 20% to the streak (5 steps to reach 100%). Using a hint resets the streak to 0.

## Complete Flow Diagram

```
User sends chat message
    ↓
chatHandler.js: sendChatMessageHandler()
    ↓
1. Get session BEFORE update (to track previous streak)
    ↓
2. Call processStudentResponse() in socraticEngine.js
    ↓
    ├─ analyzeProgress() determines:
    │   - progressScore (based on progress indicators)
    │   - stuckScore (based on stuck indicators)
    │   - madeProgress = progressScore > stuckScore && length > 3
    │
    ├─ countStuckTurns() counts consecutive non-progress turns
    │
    ├─ shouldProvideHint = stuckTurns >= 2 && !madeProgress
    │
    └─ generateTutorResponse() returns:
        - message (tutor's response)
        - hintProvided = shouldProvideHint
    ↓
3. Build step object:
    {
        tutor_prompt: tutorResponse.message,
        student_response: studentResponse,
        hint_used: tutorResponse.hintProvided,  ← Determines if streak resets
        progress_made: progressAnalysis.madeProgress,  ← Determines if streak increases
        stuck_turns: stuckTurns,
        timestamp: ...
    }
    ↓
4. Call addStepToProblem() in sessionService.js
    ↓
    ├─ Add step to problem.steps array
    │
    └─ Call updateStreakMeter(session, step)
        ↓
        ├─ IF step.hint_used === true:
        │   └─ streak_progress = 0 (RESET)
        │
        ├─ ELSE IF step.progress_made === true:
        │   ├─ streak_progress += 20 (add 20%)
        │   ├─ IF streak_progress >= 100:
        │   │   ├─ streak_completions += 1
        │   │   ├─ streak_progress = 0 (reset for next streak)
        │   │   └─ streak_completed = true (one-time flag)
        │   └─ ELSE:
        │       └─ streak_progress stays at new value
        │
        └─ ELSE (no hint, no progress):
            └─ streak_progress stays unchanged
    ↓
5. Return updated session with streak data
    ↓
6. Get final session (after update)
    ↓
7. Compare previous vs current streak to generate feedback:
    ├─ If reset: "Your streak was reset because you used a hint..."
    ├─ If completed: "🎉 Amazing! You completed your streak!"
    └─ If increased: milestone messages at 20%, 40%, 60%, 80%
    ↓
8. Send response to frontend with:
    {
        streak: {
            progress: currentStreakProgress,
            completions: streakCompletions,
            completed: streakCompleted,
            feedback: streakFeedback
        }
    }
    ↓
9. Frontend updates StreakMeter component
```

## Key Functions

### 1. `analyzeProgress()` in socraticEngine.js
**Purpose**: Determines if student made progress in their response

**Logic**:
- Looks for progress indicators: "correct", "right", numbers, "because", etc.
- Looks for stuck indicators: "I don't know", "I'm stuck", "help", etc.
- Returns `madeProgress = progressScore > stuckScore && response.length > 3`

**Input**: `studentResponse`, `previousSteps`, `problemText`
**Output**: `{ madeProgress: boolean, progressScore: number, stuckScore: number }`

### 2. `updateStreakMeter()` in sessionService.js
**Purpose**: Updates streak based on step progress

**Logic**:
```javascript
if (step.hint_used) {
    streakProgress = 0;  // RESET
} else if (step.progress_made) {
    streakProgress = Math.min(100, streakProgress + 20);  // +20%
    if (streakProgress >= 100) {
        streakCompletions++;
        streakProgress = 0;
        streakCompleted = true;  // One-time flag
    }
}
```

**Input**: `session` (with current streak_progress), `step` (with hint_used and progress_made)
**Output**: `{ streak_progress, streak_completions, streak_completed? }`

## How to Trigger Streak Changes

### To Increase Streak (+20%):
1. **Make progress without using a hint**
   - Student responds with progress indicators:
     - Uses numbers (e.g., "I think it's 15")
     - Shows reasoning (e.g., "because 3 + 2 = 5")
     - Shows confidence (e.g., "I think", "I believe")
     - Response is longer than 3 characters
   - Response should NOT trigger hint (stuck turns < 2)

**Example responses that increase streak**:
- "I think the answer is 15"
- "3 plus 2 equals 5"
- "I need to subtract 3 from both sides"
- "x = 10 because 2x = 20"

### To Reset Streak (to 0%):
1. **Use a hint**
   - Student gets stuck for 2+ consecutive turns
   - Tutor provides a hint (shouldProvideHint = true)
   - `hint_used` is set to true in the step
   - Streak resets to 0

**Example scenario**:
- Turn 1: Student says "I don't know" → no progress
- Turn 2: Student says "I'm stuck" → no progress
- Turn 3: Tutor provides hint → `hint_used = true` → streak resets to 0

### To Complete Streak (100%):
1. **Make 5 consecutive progress steps**
   - Each progress step adds 20%
   - After 5 steps: 0% → 20% → 40% → 60% → 80% → 100%
   - When reaching 100%:
     - `streak_completions` increments
     - Streak resets to 0% (starts new streak)
     - `streak_completed` flag set to true (triggers celebration)

## Testing the Streak System

### Test Case 1: Basic Progress
1. Submit a problem
2. Respond with progress: "I think the answer is 5"
3. **Expected**: Streak increases by 20% (0% → 20%)

### Test Case 2: Reset on Hint
1. Start with streak at 40%
2. Get stuck for 2 turns:
   - "I don't know"
   - "I'm stuck"
3. Tutor provides hint
4. **Expected**: Streak resets to 0%

### Test Case 3: Complete Streak
1. Start with streak at 80%
2. Make one more progress response
3. **Expected**: 
   - Streak completes (100%)
   - `streak_completions` increments
   - Streak resets to 0%
   - Celebration message appears

### Test Case 4: No Change
1. Respond with something that doesn't show progress and doesn't trigger hint
   - Very short response (< 3 chars)
   - Neutral response
2. **Expected**: Streak stays unchanged

## Debugging Tips

### Check if streak is updating:
1. **Backend logs**: Look for `updateStreakMeter` calls and returned values
2. **Frontend state**: Check `streakProgress` in Chat component
3. **Step data**: Verify `step.progress_made` and `step.hint_used` in problem steps

### Common issues:
1. **Streak not increasing**: 
   - Check if `progress_made` is true in step
   - Verify `analyzeProgress` is detecting progress correctly
   
2. **Streak not resetting on hint**:
   - Check if `hint_used` is true in step
   - Verify `shouldProvideHint` logic (needs 2+ stuck turns)

3. **Streak not completing at 100%**:
   - Verify streak reaches exactly 100% (not 120%)
   - Check if `streak_completed` flag is being set
   - Ensure frontend is reading the flag

## Code Locations

- **Streak update logic**: `backend/src/services/sessionService.js:235-267`
- **Progress analysis**: `backend/src/services/socraticEngine.js:44-88`
- **Step creation**: `backend/src/services/socraticEngine.js:294-333`
- **Streak response**: `backend/src/handlers/chatHandler.js:140-180`
- **Frontend display**: `frontend/src/components/Chat.jsx:133-156`
- **Streak meter component**: `frontend/src/components/StreakMeter.jsx`

