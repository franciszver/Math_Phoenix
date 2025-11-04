# API Testing Guide

## Quick Start

1. **Start the backend server** (in one terminal):
   ```bash
   cd backend
   npm run dev
   ```

2. **Run the test suite** (in another terminal):
   ```bash
   cd backend
   npm run test:api
   ```

## What the Tests Cover

The test suite (`scripts/test-api.js`) tests:

1. **Health Check** - Verifies server is running
2. **Create Session** - Creates a new session and gets session code
3. **Get Session** - Retrieves session details
4. **Submit Text Problem** - Submits a math problem via text
5. **Chat Message** - Sends a message in the conversation
6. **Multi-Turn Conversation** - Tests multiple conversation turns
7. **Session Resume** - Tests resuming an existing session

## Manual Testing with curl

### Create Session
```bash
curl -X POST http://localhost:3001/api/sessions \
  -H "Content-Type: application/json" \
  -d "{}"
```

### Get Session
```bash
curl http://localhost:3001/api/sessions/AB12CD
```

### Submit Problem (Text)
```bash
curl -X POST http://localhost:3001/api/sessions/AB12CD/problems \
  -H "Content-Type: application/json" \
  -d '{"text": "Solve for x: 2x + 5 = 13"}'
```

### Submit Problem (Image)
```bash
curl -X POST http://localhost:3001/api/sessions/AB12CD/problems \
  -F "image=@/path/to/image.png"
```

### Send Chat Message
```bash
curl -X POST http://localhost:3001/api/sessions/AB12CD/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "x"}'
```

## Troubleshooting

### Server not running
If you see `ECONNREFUSED`, make sure the server is running:
```bash
cd backend
npm run dev
```

### Environment variables not set
Make sure your `.env` file is configured with:
- `OPENAI_API_KEY`
- `AWS_ACCESS_KEY_ID` (optional if using default profile)
- `AWS_SECRET_ACCESS_KEY` (optional if using default profile)
- `AWS_REGION`
- `S3_BUCKET_NAME`
- `DYNAMODB_TABLE_NAME`

### AWS errors
- Check that AWS credentials are configured
- Verify S3 bucket and DynamoDB table exist
- Ensure AWS region is correct

### OpenAI errors
- Verify API key is valid
- Check you have access to GPT-4 and Vision API
- Ensure you have sufficient credits

