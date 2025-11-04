# User Test Scenarios - Math Phoenix MVP

## Overview
This document outlines comprehensive test scenarios for validating the Math Phoenix MVP. Each scenario tests a specific user flow or feature to ensure the system works as expected.

---

## Scenario 1: First-Time User - Text Problem Submission

**User Type:** Student  
**Goal:** Submit a math problem via text and complete a tutoring session

### Steps:
1. Navigate to application (localhost:5173)
2. **Consent Popup** should appear
   - Verify consent message displays correctly
   - Click "I Accept"
3. **Session Entry** screen appears
   - Click "Start New Session"
   - Verify session code is generated and displayed
   - Verify URL updates with `?session=<CODE>`
4. **Problem Input** appears
   - Type problem: `"Solve for x: 2x + 5 = 13"`
   - Click Submit or press Enter
5. **Tutor Response** appears
   - Verify tutor message displays (Socratic question, not direct answer)
   - Verify LaTeX equation renders correctly (if applicable)
   - Verify problem info displays (category, difficulty) in header
6. **Continue Conversation**
   - Type student response: `"x"`
   - Verify tutor responds with next question
   - Continue for 2-3 more exchanges
7. **Verify Session Persistence**
   - Copy session code from header
   - Open new browser tab
   - Navigate to `http://localhost:5173?session=<CODE>`
   - Verify previous messages load

### Expected Results:
- ✅ Consent popup appears and works
- ✅ Session created successfully
- ✅ Problem submitted and processed
- ✅ Tutor uses Socratic questioning (no direct answers)
- ✅ LaTeX equations render correctly
- ✅ Multi-turn conversation works
- ✅ Session can be resumed from URL

---

## Scenario 2: Image Problem Submission

**User Type:** Student  
**Goal:** Submit a math problem by uploading an image

### Steps:
1. Start new session (after consent)
2. **Image Upload Options:**
   - **Option A:** Click upload area
   - **Option B:** Drag and drop image file
   - Upload a clear image of a math problem (PNG or JPG)
3. **Verify Image Processing:**
   - Image should upload (progress indicator)
   - OCR should extract text from image
   - Extracted text should appear as problem
4. **Verify Tutor Response:**
   - Tutor should respond to extracted problem
   - LaTeX should normalize if applicable
5. **Test Fallback:**
   - Upload a low-quality/blurry image
   - Verify error message if OCR fails
   - Verify option to type problem manually

### Expected Results:
- ✅ Image upload works (click and drag-and-drop)
- ✅ OCR extracts text successfully
- ✅ Fallback to manual input if OCR fails
- ✅ Tutor responds correctly to extracted problem
- ✅ Image validation works (file type, size limits)

---

## Scenario 3: Multi-Turn Socratic Dialogue

**User Type:** Student  
**Goal:** Complete a full problem-solving session with guided questioning

### Steps:
1. Submit problem: `"Find the area of a rectangle with length 5 and width 3"`
2. **First Tutor Question:**
   - Respond: `"What do I need to find?"`
   - Verify tutor asks appropriate follow-up
3. **Continue Conversation:**
   - Answer tutor questions step-by-step
   - Verify tutor never gives direct answer
   - Verify tutor uses encouraging language
4. **Test Hint System:**
   - Give incorrect or incomplete answers 2-3 times
   - Verify tutor provides hint after getting stuck
5. **Complete Problem:**
   - Work through to solution
   - Verify tutor validates final answer

### Expected Results:
- ✅ Tutor asks guiding questions (Socratic method)
- ✅ Tutor never provides direct answers
- ✅ Hints appear after 2+ turns with no progress
- ✅ Tutor uses encouraging, adaptive tone
- ✅ Full conversation tracked and stored

---

## Scenario 4: Session Resume

**User Type:** Student  
**Goal:** Resume a previous session using session code

### Steps:
1. **Create Initial Session:**
   - Start new session, submit problem, have conversation
   - Note the session code
2. **Close Browser/App**
3. **Resume Session:**
   - Navigate to app
   - Enter session code in "Resume Session" field
   - Click "Resume" or "Enter"
4. **Verify Session Loads:**
   - Previous messages should appear
   - Current problem should be visible
   - Can continue conversation
5. **Test URL Resume:**
   - Navigate directly to `?session=<CODE>`
   - Verify session loads automatically
6. **Test localStorage Resume:**
   - Start new session, close browser
   - Reopen browser
   - Verify session loads automatically from localStorage

### Expected Results:
- ✅ Session code entry works
- ✅ Previous messages load correctly
- ✅ Conversation can continue
- ✅ URL parameter resume works
- ✅ localStorage resume works

---

## Scenario 5: Teacher Dashboard - Aggregate View

**User Type:** Teacher  
**Goal:** Access dashboard and view overall statistics

### Steps:
1. Navigate to `/dashboard`
2. **Login:**
   - Enter dashboard password (from `.env`)
   - Click "Login"
   - Verify token is stored
3. **Aggregate View (Default):**
   - Verify "Aggregate View" button is active
   - Verify statistics display:
     - Total Sessions
     - Total Problems
     - Total Hints Used
     - Problems by Category (arithmetic, algebra, geometry, etc.)
     - Problems by Difficulty (easy, medium, hard)
4. **Verify Data Accuracy:**
   - Check that numbers match actual data
   - Verify categories are properly distributed
   - Verify difficulty distribution

### Expected Results:
- ✅ Login works with correct password
- ✅ Invalid password shows error
- ✅ Aggregate statistics display correctly
- ✅ Category and difficulty distributions accurate
- ✅ All metrics visible and readable

---

## Scenario 6: Teacher Dashboard - Per-Session View

**User Type:** Teacher  
**Goal:** View individual session details and statistics

### Steps:
1. Login to dashboard (`/dashboard`)
2. **Switch to Per-Session View:**
   - Click "Per-Session View" button
   - Verify view switches
3. **Session List:**
   - Verify list of sessions appears
   - Verify each session shows:
     - Session code
     - Creation date/time
     - Problems count
     - Hints used
4. **Select Session:**
   - Click on a session
   - Verify session details panel appears
5. **Session Details:**
   - Verify displays:
     - Session code
     - Created timestamp
     - Number of problems
     - Number of messages
     - List of problems with:
       - Problem ID
       - Category
       - Difficulty
       - Hints used
       - Creation date

### Expected Results:
- ✅ View toggle works
- ✅ Session list displays correctly
- ✅ Session selection works
- ✅ Session details show all information
- ✅ Problem list is accurate

---

## Scenario 7: Teacher Override Problem Tags

**User Type:** Teacher  
**Goal:** Manually correct problem category and difficulty tags

### Steps:
1. Login to dashboard
2. Navigate to Per-Session View
3. Select a session with problems
4. **Edit Category:**
   - Click on a problem's category tag
   - Select different category from dropdown
   - Verify category updates immediately
   - Verify update persists after refresh
5. **Edit Difficulty:**
   - Click on a problem's difficulty tag
   - Select different difficulty from dropdown
   - Verify difficulty updates immediately
   - Verify update persists after refresh
6. **Verify ML Data Collection:**
   - Check that teacher override is logged
   - Verify override flag is set in ML data

### Expected Results:
- ✅ Category editing works (click to edit, dropdown selection)
- ✅ Difficulty editing works
- ✅ Updates save to DynamoDB
- ✅ Updates persist after refresh
- ✅ Teacher override tracked for ML training

---

## Scenario 8: Error Handling & Edge Cases

**User Type:** Student  
**Goal:** Verify system handles errors gracefully

### Steps:
1. **Invalid Session Code:**
   - Enter invalid session code (wrong format)
   - Verify error message displays
2. **Expired Session:**
   - Try to access very old session code
   - Verify appropriate error message
3. **Invalid Image:**
   - Try uploading non-image file
   - Verify validation error
   - Try uploading image >5MB
   - Verify size limit error
4. **Empty Problem:**
   - Try submitting empty problem
   - Verify validation prevents submission
5. **Network Errors:**
   - Disconnect internet
   - Try submitting problem
   - Verify error message displays
   - Reconnect and verify recovery

### Expected Results:
- ✅ All errors show user-friendly messages
- ✅ Validation prevents invalid submissions
- ✅ System recovers gracefully from errors
- ✅ No crashes or blank screens

---

## Scenario 9: Browser Compatibility & Responsiveness

**User Type:** Student  
**Goal:** Verify app works across browsers and devices

### Steps:
1. **Desktop Browsers:**
   - Test in Chrome
   - Test in Firefox
   - Test in Edge
   - Test in Safari (if available)
2. **Mobile Devices:**
   - Test on mobile browser (or responsive mode)
   - Verify UI is usable on small screens
   - Test image upload on mobile
3. **Features to Verify:**
   - Consent popup displays correctly
   - Chat interface is readable
   - Input fields are accessible
   - Buttons are clickable
   - LaTeX equations render

### Expected Results:
- ✅ App works in major browsers
- ✅ Responsive design works on mobile
- ✅ All features accessible on small screens
- ✅ LaTeX renders correctly everywhere

---

## Scenario 10: OCR Performance & Metrics

**User Type:** System/Developer  
**Goal:** Verify OCR/Vision metrics are being tracked

### Steps:
1. Submit multiple image problems
2. **Check Logs:**
   - Verify OCR metrics are logged
   - Check Textract success/failure rates
   - Check Vision API fallback usage
   - Verify latency metrics
3. **Verify Metrics:**
   - Textract attempts logged
   - Vision attempts logged (when fallback occurs)
   - Confidence scores recorded
   - Latency measurements present
4. **Dashboard Metrics:**
   - Check if metrics visible in dashboard (if implemented)
   - Verify aggregate OCR performance stats

### Expected Results:
- ✅ OCR metrics logged for every attempt
- ✅ Success/failure rates tracked
- ✅ Confidence scores recorded
- ✅ Latency measurements present
- ✅ Fallback events tracked

---

## Scenario 11: ML Data Collection

**User Type:** System/Developer  
**Goal:** Verify ML training data is being collected

### Steps:
1. Submit several problems (text and image)
2. Have teachers override some tags
3. **Verify Data Collection:**
   - Check DynamoDB `math-phoenix-ml-data` table
   - Verify records are created for each problem
   - Verify feature extraction includes:
     - Operation counts
     - Complexity indicators
     - Student performance data
     - Teacher override flags
4. **Verify Data Quality:**
   - Check feature vectors are complete
   - Verify raw data is stored
   - Verify metadata is accurate

### Expected Results:
- ✅ ML data collected for every problem
- ✅ Features extracted correctly
- ✅ Teacher overrides flagged
- ✅ Data stored in ML table
- ✅ Non-blocking (doesn't slow requests)

---

## Test Execution Checklist

### Before Testing:
- [ ] Backend server running (`npm run dev` in `backend/`)
- [ ] Frontend server running (`npm run dev` in `frontend/`)
- [ ] AWS credentials configured
- [ ] OpenAI API key configured
- [ ] DynamoDB tables created
- [ ] S3 bucket accessible

### Test Environment:
- [ ] `.env` file configured with all required variables
- [ ] Test images prepared (clear math problems, blurry images)
- [ ] Multiple browser tabs ready for session testing

### Post-Testing:
- [ ] Verify all scenarios pass
- [ ] Check logs for errors
- [ ] Verify data in DynamoDB
- [ ] Verify metrics are being collected
- [ ] Document any issues found

---

## Notes

- **Session Codes:** Use actual session codes generated during testing
- **Test Data:** Create diverse problems (different categories, difficulties)
- **Error Cases:** Intentionally test failure scenarios
- **Performance:** Note any slow operations or delays
- **User Experience:** Consider usability and clarity of messages

---

## Success Criteria

All scenarios should complete successfully with:
- ✅ No application crashes
- ✅ All features working as designed
- ✅ Error messages are clear and helpful
- ✅ Data persists correctly
- ✅ Metrics are being tracked
- ✅ User experience is smooth and intuitive

