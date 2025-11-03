# Setup Guide - Math Phoenix

This guide will help you set up the Math Phoenix development environment.

## Prerequisites

- **Node.js** (>= 18.x) - [Download](https://nodejs.org/)
- **npm** (comes with Node.js)
- **AWS Account** with appropriate permissions
- **OpenAI API Key** with access to GPT-4 and Vision API

## Step 1: Install Dependencies

### Backend
```bash
cd backend
npm install
```

### Frontend
```bash
cd frontend
npm install
```

## Step 2: Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in your values:
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `AWS_ACCESS_KEY_ID` - Your AWS access key (optional if using IAM roles)
   - `AWS_SECRET_ACCESS_KEY` - Your AWS secret key (optional if using IAM roles)
   - `AWS_REGION` - AWS region (default: us-east-1)
   - `SESSION_SECRET` - Random secret for session code generation (min 32 chars)
   - `DASHBOARD_PASSWORD` - Password for teacher dashboard
   - `S3_BUCKET_NAME` - Will be set after AWS setup
   - `DYNAMODB_TABLE_NAME` - Will be set after AWS setup

## Step 3: Set Up AWS Resources

You have three options:

### Option A: PowerShell Script (Windows)
```powershell
cd infrastructure
.\setup-aws.ps1
```

### Option B: Bash Script (Linux/Mac)
```bash
cd infrastructure
chmod +x setup-aws.sh
./setup-aws.sh
```

### Option C: Terraform
```bash
cd infrastructure/terraform
terraform init
terraform plan
terraform apply
```

After setup, update your `.env` file with the bucket and table names.

## Step 4: Verify Setup

### Test OpenAI API
```bash
cd backend
npm run test:openai
```

### Test Vision API (requires test image)
```bash
cd backend
npm run test:vision
```

### Verify all configuration
```bash
cd backend
npm run verify
```

For full verification including API connection test:
```bash
npm run verify:api
```

## Step 5: Start Development Servers

### Terminal 1: Backend
```bash
cd backend
npm run dev
```

The backend will run on `http://localhost:3001`

### Terminal 2: Frontend
```bash
cd frontend
npm run dev
```

The frontend will run on `http://localhost:5173`

## Troubleshooting

### OpenAI API Errors
- Verify your API key is correct
- Check that you have access to GPT-4 and Vision API
- Ensure you have sufficient credits

### AWS Errors
- Verify AWS credentials are configured (`aws configure`)
- Check IAM permissions for S3, DynamoDB, Textract
- Ensure region is correct in `.env`

### Port Already in Use
- Change `PORT` in `.env` for backend
- Change port in `frontend/vite.config.js` for frontend

## Next Steps

Once Phase 0 is complete, proceed to Phase 1:
- Implement problem input (text + image)
- Set up Socratic dialogue engine
- Integrate math rendering with KaTeX
- Implement session management

See `_docs/actionable/tasks.md` for detailed task list.

