variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "s3_bucket_name" {
  description = "Name for the S3 bucket (must be globally unique)"
  type        = string
  default     = "math-phoenix-uploads"
}

variable "dynamodb_table_name" {
  description = "Name for the DynamoDB table"
  type        = string
  default     = "math-phoenix-sessions"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

