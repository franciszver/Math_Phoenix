# AWS Infrastructure Setup

This directory contains infrastructure-as-code files for setting up AWS resources required for Math Phoenix.

## Prerequisites

- AWS CLI configured with credentials
- Appropriate IAM permissions to create:
  - S3 buckets
  - DynamoDB tables
  - Lambda functions
  - Step Functions
  - IAM roles and policies

## Resources to Create

1. **S3 Bucket** - For storing uploaded math problem images
2. **DynamoDB Table** - For storing session data with TTL
3. **Lambda Functions** - For processing requests
4. **Step Functions** - For OCR-first → Vision fallback flow
5. **IAM Roles** - For Lambda functions to access AWS services

## Setup Options

### Option 1: AWS CLI Script (Quick Setup)

Run the setup script:
```bash
cd infrastructure
./setup-aws.sh
```

Or manually run the commands in `setup-aws.sh`.

### Option 2: Terraform (Recommended)

```bash
cd infrastructure/terraform
terraform init
terraform plan
terraform apply
```

### Option 3: CloudFormation

```bash
aws cloudformation create-stack \
  --stack-name math-phoenix-infrastructure \
  --template-body file://cloudformation/template.yaml \
  --capabilities CAPABILITY_NAMED_IAM
```

## Post-Setup

After creating resources, update your `.env` file with:
- `S3_BUCKET_NAME` - Name of created S3 bucket
- `DYNAMODB_TABLE_NAME` - Name of created DynamoDB table

## Cleanup

To remove all resources:
- **Terraform**: `terraform destroy`
- **CloudFormation**: `aws cloudformation delete-stack --stack-name math-phoenix-infrastructure`
- **Manual**: See `cleanup-aws.sh`

