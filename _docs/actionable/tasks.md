# Tasks.md

## Overview
This document lists prioritized implementation tasks for the AI Math Tutor MVP and Full Build. Tasks are grouped into **Phases** that reflect logical build order, not calendar dates.

---

## Phase 0 – Project Setup

### Repository & Environment
- [x] Initialize project repository (Git).
- [x] Set up project structure (`frontend/`, `backend/`, `infrastructure/`, `scripts/`, etc.).
- [x] Install base dependencies (Node.js, Vite + React, AWS SDK, OpenAI SDK, KaTeX).
- [x] Create `.env.example` template for contributors.
- [x] Create `.env` file with required environment variables (configured with actual values).

### OpenAI Setup
- [x] Create test scripts for OpenAI API (text + vision endpoints).
- [x] Verify OpenAI API key configuration (validated via verification script).
- [ ] **Optional**: Test sample LLM call for Socratic dialogue by running `npm run test:openai` in `backend/`.
- [ ] **Optional**: Test Vision API call with sample math screenshot by running `npm run test:vision` in `backend/`.

### AWS Setup
- [x] Create infrastructure setup scripts (PowerShell, Bash, Terraform).
- [x] Configure AWS CLI with credentials (default profile verified).
- [x] Create S3 bucket for image uploads (`math-phoenix-uploads-20250103`).
- [x] Create DynamoDB table for session storage with TTL for 30‑day expiration (`math-phoenix-sessions`).
- [x] Enable Textract for OCR (configured in setup scripts, requires manual AWS console activation if not already enabled).
- [ ] **Deferred to Phase 1**: Set up Lambda functions for input handling, session management, and routing.
- [ ] **Deferred to Phase 1**: Configure Step Functions for OCR‑first → Vision fallback flow.

### Development Environment
- [x] Configure local dev server (frontend + backend).
- [x] Add logging (console logs locally, CloudWatch ready for production).
- [x] Implement basic error handling for API calls.
- [x] Create verification script (`npm run verify` in `backend/`).
- [x] Verify setup configuration (all environment variables, AWS resources, OpenAI config validated).
- [ ] **Deferred to Phase 1**: Verify end‑to‑end flow: text input → LLM response → stored in DynamoDB.

---

## Phase 1 – Core Foundations (MVP Essentials)

### Problem Input
- [ ] Implement **text input** for math problems.
- [ ] Implement **image upload** (PNG/JPG).
- [ ] Integrate **AWS S3** for image storage.
- [ ] Add **OCR pipeline** using AWS Textract.
- [ ] Add **Vision fallback** using OpenAI Vision API.
- [ ] Normalize equations into **LaTeX**.
- [ ] Auto‑tag problems into categories (arithmetic, algebra, geometry, word, multi‑step).

### Socratic Dialogue
- [ ] Implement **multi‑turn conversation engine** with OpenAI LLM.
- [ ] Enforce **Socratic prompt rules** (never give direct answers).
- [ ] Add **hint logic** (if stuck >2 turns, provide hint).
- [ ] Track **steps**: step number, tutor prompt, student response, hint usage.

### Math Rendering
- [ ] Integrate **KaTeX** for equation rendering in chat UI.

### Session Management
- [ ] Generate **short alphanumeric session codes** (6–8 chars).
- [ ] Store sessions in **DynamoDB** with expiration (30 days).
- [ ] Implement **hard delete** after expiration.
- [ ] Store **transcripts linked to structured steps**.

---

## Phase 2 – User Experience & Compliance

### Web Interface
- [ ] Build **minimalist chat UI** (React/Next.js or similar).
- [ ] Add **text input + image upload** components.
- [ ] Add **session token entry** form to resume sessions.
- [ ] Display **consent popup** at session start.

### Teacher Dashboard
- [ ] Build **password‑protected dashboard** (single shared password).
- [ ] Implement **toggle** between aggregate and per‑session views.
- [ ] Display per‑session stats: problems attempted, hints used, categories, difficulty.
- [ ] Display aggregate stats: total problems, total hints, distribution by category.
- [ ] Add **teacher override** for problem tags.

---

## Phase 3 – Robustness & Analytics

### Technical Trade‑offs
- [ ] Implement **OCR‑first routing** with Vision fallback.
- [ ] Use **rule‑based difficulty classification** for MVP.
- [ ] Ensure **session codes** are collision‑safe.
- [ ] Add logging/monitoring (CloudWatch) for OCR/Vision performance.
- [ ] Collect structured data for future ML difficulty classifier.

---

## Phase 4 – High‑Value Extensions (Full Build)

- [ ] Add **interactive whiteboard** (shared canvas).
- [ ] Implement **step visualization animations**.
- [ ] Add **voice interface** (speech‑to‑text + text‑to‑speech).
- [ ] Replace rule‑based difficulty with **ML classifier** trained on collected data.

---

## Phase 5 – Polish Features (Full Build)

- [ ] Add **animated tutor avatar** (2D/3D).
- [ ] Implement **difficulty modes** (grade‑level scaffolding).
- [ ] Add **problem generation** for practice sets.

---

## Socratic Approach (Ongoing Validation)
- [ ] Validate flow: Parse → Inventory knowns → Identify goal → Guide method → Step through → Validate answer.
- [ ] Ensure tutor tone remains **encouraging and adaptive**.
