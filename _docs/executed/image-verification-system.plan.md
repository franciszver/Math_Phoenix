<!-- 5be4796a-7c73-468d-8e1c-8f65405a87a3 98179503-cb46-4ea9-9136-99ba140576a4 -->
# Image Verification System for Math Problems

## Overview

Add automatic verification of image-based problems after every tutor response. When the LLM detects a mismatch between the stored problem text and what's actually in the image, it will be flagged so the tutor can naturally correct itself in the next response.

## Implementation Steps

### 1. Add S3 Image Download Function

**File: `backend/src/services/imageService.js`**

- Add `downloadImageFromS3(imageKey)` function using `GetObjectCommand` from `@aws-sdk/client-s3`
- Download image buffer from S3 using the stored `image_key`
- Handle errors gracefully (return null if download fails)

### 2. Add Image Verification Function

**File: `backend/src/services/imageService.js`**

- Add `verifyProblemTextAgainstImage(imageBuffer, currentProblemText)` function
- Use OpenAI Vision API (gpt-4o) with a verification prompt:
- Ask: "Does the text '[currentProblemText]' accurately represent what you see in this image? If not, what is the correct text?"
- Return object with: `{ matches: boolean, correctText: string | null, confidence: number }`
- Handle errors gracefully (return `{ matches: true }` on error to avoid breaking flow)

### 3. Store OCR Confidence in Problem Object

**File: `backend/src/handlers/problemHandler.js`**

- When creating problem from image, store `ocr_confidence` from `ocrResult` in the problem object
- Add `ocr_confidence` field to `processedProblem` before saving to session

### 4. Integrate Verification into Chat Handler

**File: `backend/src/handlers/chatHandler.js`**

- After `processStudentResponse` returns (line ~89, after tutor response is generated but before step is saved)
- Check if problem has `image_key` (image-based problem)
- **Optimization**: Check if `problem.ocr_confidence` exists and is below threshold (e.g., < 0.8)
  - If confidence >= 0.8: Skip verification (high confidence, likely accurate)
  - If confidence < 0.8 or missing: Run verification (low confidence, worth checking)
- If verification should run:
  - Download image from S3 using `problem.image_key`
  - Call verification function with image buffer and `problem.raw_input`
  - If mismatch detected:
    - Update `problem.raw_input` with corrected text
    - Re-process problem (call `processProblem()` to update LaTeX, category, difficulty)
    - Re-generate tutor response with correction context (call `generateTutorResponse()` with correctionContext)
    - Update session with corrected problem
    - Replace the tutor message in `result.tutorMessage` and `result.step.tutor_prompt`
- Store correction info for logging/debugging

### 4. Update Socratic Engine to Handle Corrections

**File: `backend/src/services/socraticEngine.js`**

- Modify `generateTutorResponse()` to accept optional `correctionContext` parameter
- If `correctionContext` exists with mismatch:
- Add system message prompting tutor to acknowledge correction naturally
- Example: "The problem text was incorrectly read as '[old]' but the image shows '[new]'. Please acknowledge this correction naturally and guide the student with the correct problem."
- Ensure correction message is encouraging and seamless

### 6. Error Handling & Logging

- Add comprehensive logging for verification attempts
- Log mismatches detected (for improving OCR)
- Ensure verification failures don't break the conversation flow
- Add metrics tracking for verification (optional, can use existing metrics service)

### 7. Update README Documentation

**File: `README.md`**

- Add new section documenting the image verification feature
- Explain the redundancy benefits (catches OCR errors like "1+12" vs "1+1")
- Highlight automatic correction capability
- Mention it runs after every tutor response for image-based problems
- Place in appropriate section (after API Endpoints or in a Features section)

## Key Files to Modify

1. **`backend/src/services/imageService.js`**

- Add `downloadImageFromS3()`
- Add `verifyProblemTextAgainstImage()`

2. **`backend/src/handlers/chatHandler.js`**

- Integrate verification after tutor response generation
- Handle correction updates

3. **`backend/src/services/socraticEngine.js`**

- Update `generateTutorResponse()` to handle corrections

4. **`backend/src/services/aws.js`** (if needed)

- Ensure GetObjectCommand import is available

## Design Decisions

- **Timing**: Verification happens synchronously after tutor response generation but before saving the step, so we can correct and re-generate the response if needed
- **Correction Flow**: If mismatch detected → update problem → re-process → re-generate tutor response with correction context → save corrected response
- **Error Handling**: Failures in verification don't break the conversation (graceful degradation - return `{ matches: true }` on error)
- **Scope**: Only verify image-based problems (check for `problem.image_key` existence)
- **Performance**: Adds one Vision API call per tutor response for image problems (acceptable cost for accuracy improvement)
- **User Experience**: Corrections are seamlessly acknowledged by the tutor in the same response, maintaining conversation flow