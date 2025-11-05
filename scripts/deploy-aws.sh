#!/bin/bash

# Math Phoenix - AWS Deployment Script
# This script deploys both backend and frontend to AWS

set -e  # Exit on error

echo "🚀 Starting Math Phoenix deployment to AWS..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if required environment variables are set
check_env_vars() {
    local missing_vars=()
    
    if [ -z "$AWS_REGION" ]; then missing_vars+=("AWS_REGION"); fi
    if [ -z "$S3_FRONTEND_BUCKET" ]; then missing_vars+=("S3_FRONTEND_BUCKET"); fi
    if [ -z "$VITE_API_URL" ]; then missing_vars+=("VITE_API_URL"); fi
    
    if [ ${#missing_vars[@]} -ne 0 ]; then
        echo -e "${RED}Error: Missing required environment variables:${NC}"
        printf '%s\n' "${missing_vars[@]}"
        echo ""
        echo "Please set these variables before running the script:"
        echo "  export AWS_REGION=us-east-1"
        echo "  export S3_FRONTEND_BUCKET=your-frontend-bucket"
        echo "  export VITE_API_URL=https://your-backend-url"
        exit 1
    fi
}

# Deploy backend to Elastic Beanstalk
deploy_backend() {
    echo -e "${YELLOW}📦 Deploying backend to Elastic Beanstalk...${NC}"
    
    cd backend
    
    # Check if EB CLI is installed
    if ! command -v eb &> /dev/null; then
        echo -e "${RED}Error: EB CLI not found. Install it with: pip install awsebcli${NC}"
        exit 1
    fi
    
    # Deploy
    eb deploy
    
    echo -e "${GREEN}✅ Backend deployed successfully!${NC}"
    cd ..
}

# Deploy frontend to S3 + CloudFront
deploy_frontend() {
    echo -e "${YELLOW}📦 Building and deploying frontend to S3...${NC}"
    
    cd frontend
    
    # Build frontend with production API URL
    echo "Building frontend with API URL: $VITE_API_URL"
    VITE_API_URL=$VITE_API_URL npm run build
    
    # Upload to S3
    echo "Uploading to S3 bucket: $S3_FRONTEND_BUCKET"
    aws s3 sync dist/ s3://$S3_FRONTEND_BUCKET --delete --region $AWS_REGION
    
    # Invalidate CloudFront cache if distribution ID is set
    if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
        echo "Invalidating CloudFront cache..."
        aws cloudfront create-invalidation \
            --distribution-id $CLOUDFRONT_DISTRIBUTION_ID \
            --paths "/*" \
            --region $AWS_REGION
        echo -e "${GREEN}✅ CloudFront cache invalidated!${NC}"
    else
        echo -e "${YELLOW}⚠️  CLOUDFRONT_DISTRIBUTION_ID not set, skipping cache invalidation${NC}"
    fi
    
    echo -e "${GREEN}✅ Frontend deployed successfully!${NC}"
    cd ..
}

# Main deployment flow
main() {
    echo "Checking environment variables..."
    check_env_vars
    
    echo ""
    echo "Deployment Configuration:"
    echo "  AWS Region: $AWS_REGION"
    echo "  Frontend Bucket: $S3_FRONTEND_BUCKET"
    echo "  Backend API URL: $VITE_API_URL"
    echo ""
    
    read -p "Continue with deployment? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled."
        exit 0
    fi
    
    # Deploy backend first
    deploy_backend
    
    echo ""
    
    # Then deploy frontend
    deploy_frontend
    
    echo ""
    echo -e "${GREEN}🎉 Deployment complete!${NC}"
    echo ""
    echo "Your application is now live:"
    echo "  Backend: $VITE_API_URL"
    if [ -n "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
        echo "  Frontend: https://$CLOUDFRONT_DISTRIBUTION_ID.cloudfront.net"
    else
        echo "  Frontend: http://$S3_FRONTEND_BUCKET.s3-website-$AWS_REGION.amazonaws.com"
    fi
}

main

