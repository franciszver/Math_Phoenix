# AWS Infrastructure Setup Script for Math Phoenix (PowerShell)
# This script creates the required AWS resources

$ErrorActionPreference = "Stop"

$REGION = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }
$BUCKET_NAME = if ($env:S3_BUCKET_NAME) { $env:S3_BUCKET_NAME } else { "math-phoenix-uploads-$(Get-Date -Format 'yyyyMMddHHmmss')" }
$TABLE_NAME = if ($env:DYNAMODB_TABLE_NAME) { $env:DYNAMODB_TABLE_NAME } else { "math-phoenix-sessions" }

Write-Host "🚀 Setting up AWS infrastructure for Math Phoenix..." -ForegroundColor Green
Write-Host "Region: $REGION"
Write-Host ""

# Check AWS CLI
try {
    $null = Get-Command aws -ErrorAction Stop
} catch {
    Write-Host "❌ AWS CLI not found. Please install it first." -ForegroundColor Red
    exit 1
}

# Check AWS credentials
try {
    $null = aws sts get-caller-identity 2>&1
} catch {
    Write-Host "❌ AWS credentials not configured. Run 'aws configure' first." -ForegroundColor Red
    exit 1
}

Write-Host "✅ AWS CLI configured" -ForegroundColor Green
Write-Host ""

# Create S3 bucket
Write-Host "📦 Creating S3 bucket: $BUCKET_NAME" -ForegroundColor Cyan
try {
    if ($REGION -eq "us-east-1") {
        aws s3api create-bucket --bucket $BUCKET_NAME --region $REGION 2>&1 | Out-Null
    } else {
        aws s3api create-bucket --bucket $BUCKET_NAME --region $REGION --create-bucket-configuration LocationConstraint=$REGION 2>&1 | Out-Null
    }
    Write-Host "✅ S3 bucket created: $BUCKET_NAME" -ForegroundColor Green
} catch {
    Write-Host "⚠️  S3 bucket may already exist or error occurred" -ForegroundColor Yellow
}
Write-Host ""

# Create DynamoDB table
Write-Host "🗄️  Creating DynamoDB table: $TABLE_NAME" -ForegroundColor Cyan
try {
    aws dynamodb create-table `
        --table-name $TABLE_NAME `
        --attribute-definitions AttributeName=session_code,AttributeType=S `
        --key-schema AttributeName=session_code,KeyType=HASH `
        --billing-mode PAY_PER_REQUEST `
        --region $REGION `
        --time-to-live-specification Enabled=true,AttributeName=expires_at 2>&1 | Out-Null

    Write-Host "⏳ Waiting for table to be active..." -ForegroundColor Yellow
    aws dynamodb wait table-exists --table-name $TABLE_NAME --region $REGION
    
    Write-Host "✅ DynamoDB table created: $TABLE_NAME" -ForegroundColor Green
} catch {
    Write-Host "⚠️  DynamoDB table may already exist or error occurred" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "✅ Infrastructure setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Add these to your .env file:" -ForegroundColor Cyan
Write-Host ('   S3_BUCKET_NAME=' + $BUCKET_NAME)
Write-Host ('   DYNAMODB_TABLE_NAME=' + $TABLE_NAME)
Write-Host ""

