/**
 * Verification script for Phase 0 setup
 * Tests that all components are properly configured
 */

import '../src/config/env.js'; // Load environment variables first
import { validateOpenAIConfig, testOpenAIConnection } from '../src/services/openai.js';
import { validateAWSConfig } from '../src/services/aws.js';
import { createLogger } from '../src/utils/logger.js';

const logger = createLogger();

async function verifySetup() {
  console.log('🔍 Verifying Phase 0 setup...\n');
  
  let allPassed = true;

  // Check environment variables
  console.log('📋 Checking environment variables...');
  const requiredEnvVars = [
    'OPENAI_API_KEY',
    'AWS_REGION',
    'S3_BUCKET_NAME',
    'DYNAMODB_TABLE_NAME',
    'SESSION_SECRET',
    'DASHBOARD_PASSWORD'
  ];

  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missingVars.length > 0) {
    console.log('❌ Missing environment variables:');
    missingVars.forEach(v => console.log(`   - ${v}`));
    console.log('💡 Copy .env.example to .env and fill in the values\n');
    allPassed = false;
  } else {
    console.log('✅ All required environment variables are set\n');
  }

  // Check OpenAI
  console.log('🤖 Testing OpenAI configuration...');
  try {
    validateOpenAIConfig();
    console.log('✅ OpenAI API key is configured');
    
    // Optional: Test actual connection (will use API credits)
    if (process.argv.includes('--test-api')) {
      console.log('   Testing API connection...');
      const result = await testOpenAIConnection();
      console.log(`✅ OpenAI API connection successful (model: ${result.model})`);
    } else {
      console.log('   (Skipping API connection test. Use --test-api to test)');
    }
  } catch (error) {
    console.log('❌ OpenAI configuration error:', error.message);
    allPassed = false;
  }
  console.log('');

  // Check AWS
  console.log('☁️  Testing AWS configuration...');
  try {
    const isValid = validateAWSConfig();
    if (isValid) {
      console.log('✅ AWS configuration is valid');
    } else {
      console.log('⚠️  AWS configuration incomplete (will use default credentials chain)');
    }
  } catch (error) {
    console.log('❌ AWS configuration error:', error.message);
    allPassed = false;
  }
  console.log('');

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (allPassed) {
    console.log('✅ Phase 0 setup verification complete!');
    console.log('🚀 You can now proceed to Phase 1');
  } else {
    console.log('⚠️  Some checks failed. Please fix the issues above.');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

verifySetup().catch(error => {
  logger.error('Verification failed:', error);
  process.exit(1);
});

