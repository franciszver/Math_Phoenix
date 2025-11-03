#!/bin/bash

# AWS Infrastructure Setup Script for Math Phoenix
# This script creates the required AWS resources

set -e

REGION=${AWS_REGION:-us-east-1}
BUCKET_NAME=${S3_BUCKET_NAME:-math-phoenix-uploads-$(date +%s)}
TABLE_NAME=${DYNAMODB_TABLE_NAME:-math-phoenix-sessions}

echo "🚀 Setting up AWS infrastructure for Math Phoenix..."
echo "Region: $REGION"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install it first."
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Run 'aws configure' first."
    exit 1
fi

echo "✅ AWS CLI configured"
echo ""

# Create S3 bucket
echo "📦 Creating S3 bucket: $BUCKET_NAME"
aws s3api create-bucket \
    --bucket "$BUCKET_NAME" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" 2>/dev/null || \
aws s3api create-bucket \
    --bucket "$BUCKET_NAME" \
    --region "$REGION" 2>/dev/null

echo "✅ S3 bucket created: $BUCKET_NAME"
echo ""

# Create DynamoDB table
echo "🗄️  Creating DynamoDB table: $TABLE_NAME"
aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --attribute-definitions \
        AttributeName=session_code,AttributeType=S \
    --key-schema \
        AttributeName=session_code,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION" \
    --time-to-live-specification \
        Enabled=true,AttributeName=expires_at

echo "⏳ Waiting for table to be active..."
aws dynamodb wait table-exists --table-name "$TABLE_NAME" --region "$REGION"

echo "✅ DynamoDB table created: $TABLE_NAME"
echo ""

# Note: Lambda functions and Step Functions setup will be done in Phase 1
# This is just the foundation (S3 and DynamoDB)

echo "✅ Infrastructure setup complete!"
echo ""
echo "📝 Add these to your .env file:"
echo "   S3_BUCKET_NAME=$BUCKET_NAME"
echo "   DYNAMODB_TABLE_NAME=$TABLE_NAME"
echo ""

