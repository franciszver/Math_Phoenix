/**
 * Setup DynamoDB Table Script
 * Checks if the DynamoDB table exists and creates it if needed
 */

import '../src/config/env.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { createLogger } from '../src/utils/logger.js';

const logger = createLogger();

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'math-phoenix-sessions';
const REGION = process.env.AWS_REGION || 'us-east-1';

// Create DynamoDB client
const dynamoClient = new DynamoDBClient({
  region: REGION,
  ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  } : {})
});

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
      return;
    }

    console.log(`📦 DynamoDB table not found. Creating...`);
    await createTable();
    console.log(`\n✅ Setup complete!`);
  } catch (error) {
    logger.error('❌ Error setting up DynamoDB:', error);
    console.error('\n❌ Failed to setup DynamoDB table');
    console.error('   Error:', error.message);
    console.error('\n💡 Make sure:');
    console.error('   1. AWS credentials are configured (run: aws configure)');
    console.error('   2. You have permissions to create DynamoDB tables');
    console.error('   3. The AWS_REGION is correct');
    process.exit(1);
  }
}

setupDynamoDB().catch(error => {
  logger.error('Setup failed:', error);
  process.exit(1);
});

