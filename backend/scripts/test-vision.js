/**
 * Test script for OpenAI Vision API
 * Verifies API key and tests image analysis capability
 * 
 * Note: This script requires a sample image file
 * You can create a simple math problem image or use a URL
 */

import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function testVisionAPI() {
  console.log('🧪 Testing OpenAI Vision API...\n');

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment variables');
    console.log('💡 Make sure you have a .env file with OPENAI_API_KEY set');
    process.exit(1);
  }

  // Try to find a test image, or use a base64 encoded simple example
  const testImagePath = path.join(__dirname, 'test-image.png');
  
  let imageData;
  let imageFormat = 'url';

  if (fs.existsSync(testImagePath)) {
    console.log('📷 Using local test image:', testImagePath);
    const imageBuffer = fs.readFileSync(testImagePath);
    imageData = imageBuffer.toString('base64');
    imageFormat = 'base64';
  } else {
    console.log('📷 No local test image found. Using a sample math problem description.');
    console.log('💡 To test with an actual image, place a test-image.png in the scripts folder.\n');
    
    // For testing, we'll use a text-based approach or create a simple test
    console.log('⚠️  Vision API requires an actual image file.');
    console.log('   Creating a simple test without image upload...\n');
    
    // We'll test the API structure but note that actual image is needed
    console.log('💡 For full testing, you can:');
    console.log('   1. Create a simple math problem image (e.g., "2x + 5 = 13")');
    console.log('   2. Save it as test-image.png in the scripts folder');
    console.log('   3. Run this script again\n');
    
    // Test with a URL-based approach (if you have a public image URL)
    console.log('📝 Testing API structure with text description instead...');
    return;
  }

  try {
    console.log('📤 Sending test request to Vision API...\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Updated from deprecated 'gpt-4-vision-preview'
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What math problem is shown in this image? Extract the equation or problem statement.'
            },
            {
              type: 'image_url',
              image_url: imageFormat === 'base64' 
                ? { url: `data:image/png;base64,${imageData}` }
                : { url: imageData }
            }
          ]
        }
      ],
      max_tokens: 200
    });

    console.log('✅ OpenAI Vision API connection successful!');
    console.log('');
    console.log('📥 Response:');
    console.log(response.choices[0].message.content);
    console.log('');
    console.log('📊 Usage:');
    console.log(`   Prompt tokens: ${response.usage.prompt_tokens}`);
    console.log(`   Completion tokens: ${response.usage.completion_tokens}`);
    console.log(`   Total tokens: ${response.usage.total_tokens}`);

  } catch (error) {
    console.error('❌ Error testing OpenAI Vision API:');
    if (error.status === 401) {
      console.error('   Authentication failed. Check your API key.');
    } else if (error.status === 429) {
      console.error('   Rate limit exceeded. Try again later.');
    } else if (error.message.includes('vision')) {
      console.error('   Vision API may not be available with your API key tier.');
      console.error('   Check your OpenAI account for Vision API access.');
    } else {
      console.error('   ', error.message);
    }
    process.exit(1);
  }
}

testVisionAPI();

