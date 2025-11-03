/**
 * AWS Service Clients
 * Centralized configuration for AWS SDK clients
 */

import '../config/env.js'; // Load environment variables first
import { S3Client } from '@aws-sdk/client-s3';
import { TextractClient } from '@aws-sdk/client-textract';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createLogger } from '../utils/logger.js';

const logger = createLogger();

// AWS Configuration
const awsConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    : undefined // Will use default credentials chain (IAM role, env vars, etc.)
};

// S3 Client
export const s3Client = new S3Client(awsConfig);

// Textract Client
export const textractClient = new TextractClient(awsConfig);

// DynamoDB Client
const dynamoDBClient = new DynamoDBClient(awsConfig);
export const dynamoDocClient = DynamoDBDocumentClient.from(dynamoDBClient);

// Validate AWS configuration
export function validateAWSConfig() {
  const missing = [];
  
  if (!process.env.AWS_REGION) {
    missing.push('AWS_REGION');
  }
  
  if (!process.env.S3_BUCKET_NAME) {
    missing.push('S3_BUCKET_NAME');
  }
  
  if (!process.env.DYNAMODB_TABLE_NAME) {
    missing.push('DYNAMODB_TABLE_NAME');
  }
  
  if (missing.length > 0) {
    logger.warn(`Missing AWS configuration: ${missing.join(', ')}`);
    logger.warn('AWS credentials will use default chain (IAM role, env vars, etc.)');
  }
  
  return missing.length === 0;
}

logger.debug('AWS clients initialized', { region: awsConfig.region });

