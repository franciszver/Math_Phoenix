/**
 * Test script for OpenRouter Vision API
 * Verifies API key and tests image analysis capability
 *
 * Usage:
 *   node scripts/test-vision.js                  - uses a built-in 1x1 PNG fallback image
 *   node scripts/test-vision.js <path-to-image>  - uses a real image file
 */

import '../src/config/env.js'; // Load environment variables first
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createChatCompletion, VISION_MODEL, validateOpenAIConfig } from '../src/services/openai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Minimal valid 1x1 white pixel PNG, used when no real test image is available.
const FALLBACK_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function testVisionAPI() {
  console.log('🧪 Testing OpenRouter Vision API...\n');

  try {
    validateOpenAIConfig();
  } catch (error) {
    console.error('❌ OPENROUTER_API_KEY not found in environment variables');
    console.log('💡 Make sure you have a .env file with OPENROUTER_API_KEY set');
    process.exit(1);
  }

  const argImagePath = process.argv[2];
  const testImagePath = argImagePath
    ? path.resolve(argImagePath)
    : path.join(__dirname, 'test-image.png');

  let imageBase64;
  if (fs.existsSync(testImagePath)) {
    console.log('📷 Using image:', testImagePath);
    imageBase64 = fs.readFileSync(testImagePath).toString('base64');
  } else {
    console.log('📷 No test image found. Using built-in 1x1 pixel PNG fallback.');
    console.log('💡 To test with a real image, place test-image.png in the scripts folder');
    console.log('   or pass a path: node scripts/test-vision.js <path-to-image>\n');
    imageBase64 = FALLBACK_IMAGE_BASE64;
  }

  try {
    console.log('📤 Sending test request to Vision API...');
    console.log('Model:', VISION_MODEL);
    console.log('');

    const response = await createChatCompletion({
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What math problem is shown in this image? Extract the equation or problem statement. If there is no math problem visible, say so.'
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${imageBase64}` }
            }
          ]
        }
      ],
      max_tokens: 200
    });

    if (!response?.choices?.[0]) {
      const upstreamMessage = response?.error?.message || 'No choices returned in response';
      throw new Error(`Upstream error: ${upstreamMessage}`);
    }

    console.log('✅ PASS - OpenRouter Vision API round-trip succeeded');
    console.log('');
    console.log('📥 Response:');
    console.log(response.choices[0].message.content);
    console.log('');
    console.log(`✨ Model used: ${response.model || VISION_MODEL}`);

  } catch (error) {
    console.error('❌ FAIL - Error testing OpenRouter Vision API:');
    if (error.status === 401) {
      console.error('   Authentication failed. Check your OPENROUTER_API_KEY.');
    } else if (error.status === 429) {
      console.error('   Rate limit exceeded. Try again later.');
    } else {
      console.error('   ', error.message);
    }
    process.exit(1);
  }
}

testVisionAPI();
