/**
 * AWS Infrastructure Setup Script
 * Checks if S3 bucket and DynamoDB table exist and creates them if needed
 */

import '../src/config/env.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { createLogger } from '../src/utils/logger.js';

const logger = createLogger();

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'math-phoenix-sessions';
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'math-phoenix-uploads-20250103';
const REGION = process.env.AWS_REGION || 'us-east-1';

// AWS configuration
const awsConfig = {
  region: REGION,
  ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  } : {})
};

// Create AWS clients
const dynamoClient = new DynamoDBClient(awsConfig);
const s3Client = new S3Client(awsConfig);

// ==================== DynamoDB Functions ====================

async function checkTableExists() {
  try {
    const command = new DescribeTableCommand({ TableName: TABLE_NAME });
    const response = await dynamoClient.send(command);
    return response.Table && response.Table.TableStatus === 'ACTIVE';
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

async function createTable() {
  logger.info(`Creating DynamoDB table: ${TABLE_NAME}`);
  
  const command = new CreateTableCommand({
    TableName: TABLE_NAME,
    AttributeDefinitions: [
      {
        AttributeName: 'session_code',
        AttributeType: 'S'
      }
    ],
    KeySchema: [
      {
        AttributeName: 'session_code',
        KeyType: 'HASH'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST',
    TimeToLiveSpecification: {
      Enabled: true,
      AttributeName: 'expires_at'
    },
    Tags: [
      {
        Key: 'Name',
        Value: 'Math Phoenix Sessions'
      }
    ]
  });

  try {
    await dynamoClient.send(command);
    logger.info(`✅ DynamoDB table created: ${TABLE_NAME}`);
    logger.info('⏳ Waiting for table to become active...');
    
    // Wait for table to be active
    let attempts = 0;
    const maxAttempts = 30;
    while (attempts < maxAttempts) {
      const exists = await checkTableExists();
      if (exists) {
        logger.info(`✅ Table is now active: ${TABLE_NAME}`);
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      attempts++;
    }
    
    logger.warn('⚠️  Table creation initiated but may not be fully active yet');
    return true;
  } catch (error) {
    if (error.name === 'ResourceInUseException') {
      logger.info(`✅ Table already exists: ${TABLE_NAME}`);
      return true;
    }
    throw error;
  }
}

async function setupDynamoDB() {
  console.log('🔍 Checking DynamoDB table...');
  console.log(`   Table: ${TABLE_NAME}`);
  console.log(`   Region: ${REGION}\n`);

  try {
    const exists = await checkTableExists();
    
    if (exists) {
      console.log(`✅ DynamoDB table already exists: ${TABLE_NAME}`);
      return true;
    }

    console.log(`📦 DynamoDB table not found. Creating...`);
    await createTable();
    console.log(`✅ DynamoDB table setup complete!`);
    return true;
  } catch (error) {
    logger.error('❌ Error setting up DynamoDB:', error);
    console.error('\n❌ Failed to setup DynamoDB table');
    console.error('   Error:', error.message);
    return false;
  }
}

// ==================== S3 Functions ====================

async function checkBucketExists() {
  try {
    const command = new HeadBucketCommand({ Bucket: BUCKET_NAME });
    await s3Client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    // If it's a 403, the bucket exists but we don't have permission
    if (error.$metadata?.httpStatusCode === 403) {
      logger.warn('Bucket may exist but access denied');
      return true;
    }
    throw error;
  }
}

async function createBucket() {
  logger.info(`Creating S3 bucket: ${BUCKET_NAME}`);
  
  try {
    const command = new CreateBucketCommand({
      Bucket: BUCKET_NAME,
      ...(REGION !== 'us-east-1' ? {
        CreateBucketConfiguration: {
          LocationConstraint: REGION
        }
      } : {})
    });

    await s3Client.send(command);
    logger.info(`✅ S3 bucket created: ${BUCKET_NAME}`);
    return true;
  } catch (error) {
    if (error.name === 'BucketAlreadyExists' || error.name === 'BucketAlreadyOwnedByYou') {
      logger.info(`✅ S3 bucket already exists: ${BUCKET_NAME}`);
      return true;
    }
    throw error;
  }
}

async function setupS3() {
  console.log('🔍 Checking S3 bucket...');
  console.log(`   Bucket: ${BUCKET_NAME}`);
  console.log(`   Region: ${REGION}\n`);

  try {
    const exists = await checkBucketExists();
    
    if (exists) {
      console.log(`✅ S3 bucket already exists: ${BUCKET_NAME}`);
      return true;
    }

    console.log(`📦 S3 bucket not found. Creating...`);
    await createBucket();
    console.log(`✅ S3 bucket setup complete!`);
    return true;
  } catch (error) {
    logger.error('❌ Error setting up S3:', error);
    console.error('\n❌ Failed to setup S3 bucket');
    console.error('   Error:', error.message);
    console.error('   Code:', error.name);
    return false;
  }
}

// ==================== Main Setup ====================

async function setupAWS() {
  console.log('🚀 Setting up AWS infrastructure for Math Phoenix...\n');
  console.log(`Region: ${REGION}\n`);

  let allSuccess = true;

  // Setup S3
  const s3Success = await setupS3();
  console.log('');
  
  if (!s3Success) {
    allSuccess = false;
    console.error('⚠️  S3 setup failed. Image uploads will not work.');
    console.error('💡 Make sure:');
    console.error('   1. AWS credentials are configured');
    console.error('   2. You have permissions to create S3 buckets');
    console.error('   3. The bucket name is unique (S3 bucket names are globally unique)');
    console.error('   4. If the bucket name is taken, set S3_BUCKET_NAME in .env to a different name\n');
  }

  // Setup DynamoDB
  const dynamoSuccess = await setupDynamoDB();
  console.log('');
  
  if (!dynamoSuccess) {
    allSuccess = false;
    console.error('⚠️  DynamoDB setup failed. Sessions will not work.');
    console.error('💡 Make sure:');
    console.error('   1. AWS credentials are configured');
    console.error('   2. You have permissions to create DynamoDB tables');
    console.error('   3. The AWS_REGION is correct\n');
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (allSuccess) {
    console.log('✅ AWS infrastructure setup complete!');
    console.log('\n📝 Current configuration:');
    console.log(`   S3_BUCKET_NAME=${BUCKET_NAME}`);
    console.log(`   DYNAMODB_TABLE_NAME=${TABLE_NAME}`);
    console.log(`   AWS_REGION=${REGION}`);
  } else {
    console.log('⚠️  Some resources failed to setup. See errors above.');
    process.exit(1);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

setupAWS().catch(error => {
  logger.error('Setup failed:', error);
  console.error('\n❌ Fatal error during setup:', error.message);
  process.exit(1);
});

