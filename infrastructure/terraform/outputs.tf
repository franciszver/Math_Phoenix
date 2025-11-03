output "s3_bucket_name" {
  description = "Name of the created S3 bucket"
  value       = aws_s3_bucket.uploads.id
}

output "dynamodb_table_name" {
  description = "Name of the created DynamoDB table"
  value       = aws_dynamodb_table.sessions.name
}

output "aws_region" {
  description = "AWS region where resources are created"
  value       = var.aws_region
}

