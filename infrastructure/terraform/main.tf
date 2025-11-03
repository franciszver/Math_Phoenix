terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# S3 Bucket for image uploads
resource "aws_s3_bucket" "uploads" {
  bucket = var.s3_bucket_name

  tags = {
    Name        = "Math Phoenix Uploads"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Disabled"
  }
}

# DynamoDB Table for session storage
resource "aws_dynamodb_table" "sessions" {
  name           = var.dynamodb_table_name
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "session_code"

  attribute {
    name = "session_code"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  tags = {
    Name        = "Math Phoenix Sessions"
    Environment = var.environment
  }
}

# Outputs
output "s3_bucket_name" {
  value = aws_s3_bucket.uploads.id
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.sessions.name
}

