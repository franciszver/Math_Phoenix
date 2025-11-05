# 📘 Product Requirements Document (PRD)  
**Project:** Math Phoenix – Phase 2 (Multi‑Agent Group Learning)  
**Owner:** [Your team]  
**Date:** [Insert date]

---

## 1. Overview
Phase 2 expands Math Phoenix from one‑on‑one Socratic tutoring into **multi‑agent group learning cohorts**. An orchestrator agent assigns students into small groups (max 5 per agent). Each group agent manages a unified chat window, generates teaching plans based on student failings, and delivers collaborative “surprise quizzes.” Teachers remain in the loop, approving teaching plans and monitoring group compliance through the dashboard.

---

## 2. Goals & Objectives
- **Collaborative learning:** Enable peer‑to‑peer learning through shared quizzes and group dialogue.  
- **Adaptive instruction:** Dynamically adjust quiz difficulty based on each student’s session history.  
- **Human oversight:** Teachers approve teaching plans before quizzes are delivered.  
- **Transparency:** Teachers see group progress, skipped students, and compliance metrics.  
- **Scalability:** Support up to 4 groups simultaneously, each with its own agent.  
- **Seamless deployment:** Integrate cleanly into Render.com auto‑deploy pipelines for both frontend and backend Node services.  
- **AWS integration:** Reuse existing DynamoDB tables and S3 buckets for Phase 2 data storage and asset handling.  

---

## 3. Key Features

### 3.1 Orchestrator Agent
- Assigns students to one of four groups based on misconception clusters and pace.  
- Outputs rationale and group learning goals.  
- SessionIds used for identification (no names).  

### 3.2 Group Agents
- Manage up to 5 students per group.  
- Draft teaching plans from observed failings.  
- Submit plans for teacher approval.  
- Deliver unified group quizzes in chat.  
- Wait for all responses before advancing; mark non‑responders as “skipped.”  
- Provide correct answers after responses, highlighting students who were close or correct.  
- Encourage participation (even wrong answers are acceptable).  

### 3.3 Teacher Dashboard (Phase 2 Enhancements)
- Approve/reject/edit teaching plans.  
- View group compliance (skipped students flagged).  
- Aggregate group profiles with option to drill into sessionId histories.  
- No mid‑session reassignment of students.  

### 3.4 Group Quiz Flow
- One unified quiz per group.  
- Collect responses from all students.  
- Classify answers (correct, partial, misconception).  
- Generate Socratic dialogue referencing peer answers.  
- Encourage reflection and consensus building.  

---

## 4. User Stories

- **Student:**  
  “As a student, I want to see my peers’ answers so I can learn from their reasoning.”  
- **Teacher:**  
  “As a teacher, I want to approve AI teaching plans before they’re delivered, so I can ensure quality.”  
- **Orchestrator Agent:**  
  “As the orchestrator, I want to assign students to groups based on their misconceptions, so each group has a focused learning path.”  
- **Group Agent:**  
  “As a group agent, I want to wait for all student responses before teaching, so the group learns together.”  

---

## 5. Functional Requirements

| Feature | Requirement |
|---------|-------------|
| Student grouping | Orchestrator assigns students to 1 of 4 groups with rationale |
| Teaching plan | Group agent drafts plan based on failings; teacher approves |
| Quiz delivery | Group agent posts unified quiz; waits for all responses |
| Response handling | Classify answers; highlight patterns; generate Socratic dialogue |
| Timeout handling | Mark skipped students; coax participation; teacher sees noncompliance |
| Teacher controls | Approve/reject/edit plans; monitor compliance |
| Chat system | Unified group chat; turn‑based progression; timeout handling |

---

## 6. Non‑Functional Requirements
- **Scalability:** Support up to 20 students (4 groups × 5 students).  
- **Reliability:** Ensure quiz flow doesn’t advance until all responses are collected or marked skipped.  
- **Usability:** Teacher dashboard must clearly show compliance and group summaries.  
- **Privacy:** Use sessionIds only; store minimal PII.  
- **Cost control:** Optimize token usage with structured prompts and external state storage.  
- **Deployment:** Auto‑deploy via Render.com pipelines on commits to `main`.  
- **AWS integration:**  
  - DynamoDB tables for session state and ML data.  
  - S3 buckets for frontend assets and student uploads.  

---

## 7. Success Metrics
- Student engagement (participation rate in group quizzes).  
- Teacher satisfaction with AI‑generated plans.  
- Learning gains measured by reduced misconceptions.  
- Compliance tracking (skipped responses flagged).  

---

## 8. Risks & Mitigations
- **Risk:** Students delay responses → **Mitigation:** Timeout + coaxing; mark skipped; teacher follow‑up.  
- **Risk:** AI plan quality varies → **Mitigation:** Human approval required.  
- **Risk:** Token cost spikes → **Mitigation:** Structured context, external state store.  

---

## 9. Resolved Questions
- Teachers cannot reassign students mid‑session.  
- SessionIds used instead of names.  
- Quiz difficulty adapted dynamically using session history.  
- Skipped students flagged in dashboard.  
- Correct answers revealed after responses, with highlights for close/correct answers.  
- Teacher dashboard shows aggregate group profile, with drill‑down to sessionIds if needed.  

---

## 10. Workflow Diagram (ASCII)

[Orchestrator Agent] | v [Group Assignment: A-D] | v [Group Agent] ---> [Teaching Plan Draft] ---> [Teacher Approval] | | | v | [Approved Plan] v [Unified Quiz] --> [Collect Responses] --> [Classify + Highlight] | v [Socratic Dialogue referencing peer answers] | v [Teacher Dashboard: compliance + outcomes]


---

## 11. Requirements Matrix (with Render.com + AWS context)

| New Feature / Enhancement | Backend Services (Node, Render.com) | Frontend Components (Node, Render.com) | Dashboard Changes | AWS Resources |
|---------------------------|--------------------------------------|----------------------------------------|------------------|---------------|
| Orchestrator Agent        | New **Orchestration Service** | N/A | Display group assignments rationale | DynamoDB (`math-phoenix-sessions-prod`) for group membership |
| Group Agents              | Extend **Socratic Engine** with group context | GroupChat component (new React/Node) | Show group compliance + skipped students | DynamoDB (`math-phoenix-sessions-prod`) for per-student state |
| Teaching Plan Approval    | Extend **Learning Assessment Service** | PlanReviewModal (new React component) | Approve/reject/edit plans | DynamoDB (`math-phoenix-ml-data-prod`) for plan metadata |
| Unified Group Quiz        | Extend **Assessment Service** | GroupQuiz component (new React) | Aggregate quiz results per group | DynamoDB (`math-phoenix-sessions-prod`) for quiz state |
| Response Classification   | Extend **ML Data Service** | ResponseHighlight UI | Show correct/close/incorrect breakdown | DynamoDB (`math-phoenix-ml-data-prod`) for misconception tags |
| Timeout Handling          | Extend **Session Service** with timeout + skip logic | ParticipationPrompt (new React) | Flag skipped students in compliance view | DynamoDB (`math-phoenix-sessions-prod`) for compliance logs |
| Compliance Tracking       | Extend **Dashboard Service** | N/A | Compliance tab with skipped counts | DynamoDB (`math-phoenix-sessions-prod`) aggregated metrics |
| Adaptive Difficulty       | Extend **Problem Processing Service** | N/A | Show difficulty adaptation rationale | DynamoDB (`math-phoenix-ml-data-prod`) + S3 (`math-phoenix-uploads-20250103`) for problem history |

---

## 12. Deployment & DevOps Considerations
- **Hosting:** Both frontend and backend continue to run as Node services on Render.com.  
- **Auto‑deploy:** Each commit to `main` triggers auto‑deploy for both services.  
- **Branching strategy:**  
  - Use feature branches for Phase 2 components.  
  - Merge to `main` only after passing CI tests.  
- **CI/CD testing:**  
  - Unit tests for orchestrator and group agent logic.  
  - Integration tests for quiz flow and dashboard compliance.  
  - Frontend snapshot tests for new React components.  
- **Versioning:**  
  - API endpoints for Phase 2 should be versioned (`/api/v2/...`) to avoid breaking Phase 1 clients.  
- **Monitoring:**  
  - Use Render.com logs + CloudWatch structured logging (already in Phase 1) to track group agent performance.  
- **Rollback:**  
  - Render.com auto‑deploy rollback strategy: revert to last successful build if Phase 2 deploy fails.  
- **AWS resource usage:**  
  - DynamoDB tables (`math-phoenix-sessions-prod`, `math-phoenix-ml-data-prod`) store session state and ML data.  
  - S3 buckets (`math-phoenix-frontend-prod-20251104`, `math-phoenix-uploads-20250103`) serve frontend assets and student uploads.  

---

