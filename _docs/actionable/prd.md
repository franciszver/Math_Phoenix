# Product Requirements Document (PRD)

## Objective
Build an **AI math tutor** that guides K‑12 students through problems using **Socratic questioning**. The system accepts problems via **text or image upload** and helps students discover solutions through guided dialogue, inspired by the [OpenAI x Khan Academy demo](https://www.youtube.com/watch?v=IvXZCocyU_M).

---

## Success Criteria
- Supports **5+ problem categories**: simple arithmetic, algebra (single variable), geometry, word problems, and multi‑step problems.  
- **Never provides direct answers**; instead uses Socratic questioning.  
- Maintains **multi‑turn conversation context**.  
- Adapts to **student understanding level** with hints and encouragement.  
- Provides **teacher dashboard** with aggregate and per‑session stats.  

---

## MVP Features

### Problem Input
- **Text entry** for typed problems.  
- **Image upload** with OCR (AWS Textract) + fallback to OpenAI Vision.  
- **Normalization**: Equations converted into LaTeX; word problems stored raw until tutor dialogue.  
- **Auto‑tagging**: Each problem tagged into one of the five categories, with teacher override option.  

### Socratic Dialogue
- Multi‑turn conversation flow.  
- Tutor asks guiding questions: *“What information do we have?”*, *“What method might help?”*.  
- Provides hints if student is stuck for >2 turns.  
- Encouraging, adaptive tone.  
- **Step tracking**: Each problem broken into explicit steps, logged with student responses and hints.  

### Math Rendering
- Equations displayed in **KaTeX** for clarity.  

### Web Interface
- Minimalist chat UI with:  
  - Text input  
  - Image upload  
  - Session token entry to resume prior sessions  
- **Consent popup** at session start:  
  > “This tutoring session will be recorded to improve your learning experience and provide teachers with progress insights. By continuing, you consent to this communication being stored and reviewed.”  

### Session Management
- Short alphanumeric session codes (6–8 chars).  
- Sessions expire after **30 days** (hard delete).  

### Teacher Dashboard
- Password‑protected (single shared password).  
- Toggle between **aggregate view** and **per‑session view**.  
- Shows: number of problems attempted, hints used, categories, difficulty levels.  

---

## Full Feature Set (Beyond MVP)

### High‑Value Extensions
- **Interactive Whiteboard**: Shared canvas for diagrams and annotations.  
- **Step Visualization**: Animated breakdown of solution steps.  
- **Voice Interface**: Text‑to‑speech for tutor responses, speech‑to‑text for student input.  
- **ML‑based Difficulty Classification**: Train classifier on collected data for nuanced difficulty detection.  

### Polish Features
- **Animated Avatar**: 2D/3D tutor character with expressions.  
- **Difficulty Modes**: Adjustable scaffolding by grade level.  
- **Problem Generation**: System generates similar practice problems for reinforcement.  

---

## Socratic Approach

**System Prompt:**  
> “You are a patient math tutor. NEVER give direct answers. Guide through questions: *‘What information do we have?’* *‘What method might help?’* If stuck >2 turns, provide a concrete hint. Use encouraging language.”

**Flow:**  
1. Parse problem (OCR or text).  
2. Inventory knowns.  
3. Identify goal (what’s being solved).  
4. Guide method selection.  
5. Step through solution interactively.  
6. Validate student’s final answer.  

---

## Example Interaction

**Student:** [uploads `2x + 5 = 13`]  
**Tutor:** “What are we trying to find?”  
**Student:** “x”  
**Tutor:** “Right! To get x alone, we need to undo the +5 and ×2. Which should we undo first?”  
**Student:** “the +5?”  
**Tutor:** “Exactly! How do we undo adding 5?”  

---

## Sample JSON Schema (MVP)

```json
{
  "session_code": "AB12CD",
  "created_at": "2025-11-03T14:00:00Z",
  "expires_at": "2025-12-03T14:00:00Z",
  "problems": [
    {
      "problem_id": "P001",
      "category": "algebra",
      "difficulty": "easy",
      "raw_input": "2x + 5 = 13",
      "normalized_latex": "2x + 5 = 13",
      "steps": [
        {
          "step_number": 1,
          "tutor_prompt": "What are we trying to find?",
          "student_response": "x",
          "hint_used": false
        },
        {
          "step_number": 2,
          "tutor_prompt": "Which operation should we undo first?",
          "student_response": "the +5",
          "hint_used": true
        }
      ],
      "hints_used_total": 1
    }
  ],
  "transcript": [
    {"speaker": "student", "message": "2x + 5 = 13"},
    {"speaker": "tutor", "message": "What are we trying to find?"},
    {"speaker": "student", "message": "x"},
    {"speaker": "tutor", "message": "Right! To get x alone..."}
  ]
}
