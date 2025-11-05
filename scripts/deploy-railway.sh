#!/bin/bash

# Math Phoenix - Railway Deployment Script
# This script deploys the backend to Railway

set -e  # Exit on error

echo "🚀 Starting Math Phoenix backend deployment to Railway..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}Error: Railway CLI not found.${NC}"
    echo "Install it with: npm install -g @railway/cli"
    exit 1
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}Not logged in to Railway. Please login:${NC}"
    railway login
fi

# Deploy backend
echo -e "${YELLOW}📦 Deploying backend to Railway...${NC}"
cd backend

railway up

echo -e "${GREEN}✅ Backend deployed successfully!${NC}"
echo ""
echo "Get your backend URL with: railway domain"
echo ""
echo "Next steps:"
echo "1. Note your backend URL"
echo "2. Deploy frontend to Vercel with VITE_API_URL set to your backend URL"
echo "3. Update backend CORS settings to allow your frontend domain"

cd ..

