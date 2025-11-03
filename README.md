# Math_Phoenix

An **AI-powered math tutor** that guides K‑12 students through problems using **Socratic questioning**.  
Math_Phoenix accepts problems via **text or image upload**, normalizes math into LaTeX, and helps students discover solutions through guided dialogue.  
It also provides a **teacher dashboard** with aggregate and per‑session insights.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (>= 18.x recommended)
- npm (comes with Node.js)
- AWS account with:
  - S3 bucket
  - Textract enabled
  - DynamoDB table (with TTL for 30‑day expiration)
- OpenAI API key (with access to GPT + Vision endpoints)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd Math_Phoenix
   ```

2. Install dependencies:
   ```bash
   # Install backend dependencies
   cd backend
   npm install

   # Install frontend dependencies
   cd ../frontend
   npm install
   ```

3. Set up environment variables:
   ```bash
   # Copy the example file and fill in your values
   cp .env.example .env
   # Edit .env with your actual credentials
   ```

4. Set up AWS resources:
   ```bash
   # See infrastructure/README.md for setup instructions
   cd infrastructure
   # Follow the setup guide
   ```

5. Start development servers:
   ```bash
   # Terminal 1: Start backend
   cd backend
   npm run dev

   # Terminal 2: Start frontend
   cd frontend
   npm run dev
   ```

---

## 📁 Project Structure

```
Math_Phoenix/
├── frontend/          # Vite + React frontend
├── backend/           # Express backend (Lambda-ready)
├── infrastructure/    # AWS infrastructure as code
├── scripts/           # Utility scripts
└── _docs/             # Documentation
```

---

## 🛠️ Development

- **Frontend**: Vite + React (runs on http://localhost:5173 by default)
- **Backend**: Express (runs on http://localhost:3001 by default)

---

## 📚 Documentation

See `_docs/` for detailed documentation:
- `actionable/prd.md` - Product Requirements Document
- `actionable/architecture_mvp.md` - Architecture overview
- `actionable/tasks.md` - Implementation tasks

---

## 🔐 Environment Variables

Required environment variables (see `.env.example`):
- `OPENAI_API_KEY` - OpenAI API key
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `AWS_REGION` - AWS region (e.g., us-east-1)
- `SESSION_SECRET` - Secret for session code generation
- `DASHBOARD_PASSWORD` - Password for teacher dashboard

