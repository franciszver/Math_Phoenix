#!/bin/bash

# Math Phoenix - Vercel Deployment Script
# This script deploys the frontend to Vercel

set -e  # Exit on error

echo "🚀 Starting Math Phoenix frontend deployment to Vercel..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo -e "${RED}Error: Vercel CLI not found.${NC}"
    echo "Install it with: npm install -g vercel"
    exit 1
fi

# Check if VITE_API_URL is set
if [ -z "$VITE_API_URL" ]; then
    echo -e "${YELLOW}⚠️  VITE_API_URL not set${NC}"
    echo "Please enter your backend API URL:"
    read -p "Backend URL: " VITE_API_URL
    export VITE_API_URL
fi

echo ""
echo "Deployment Configuration:"
echo "  Backend API URL: $VITE_API_URL"
echo ""

# Deploy frontend
echo -e "${YELLOW}📦 Deploying frontend to Vercel...${NC}"
cd frontend

# Deploy to production
vercel --prod

echo -e "${GREEN}✅ Frontend deployed successfully!${NC}"
echo ""
echo "Important: Make sure to add VITE_API_URL as an environment variable in Vercel dashboard:"
echo "  1. Go to your project settings in Vercel"
echo "  2. Navigate to Environment Variables"
echo "  3. Add: VITE_API_URL = $VITE_API_URL"
echo "  4. Redeploy if needed"

cd ..

