/**
 * Test script for OpenRouter OpenAI-compatible API
 * Verifies API key and tests text completion via OpenRouter
 */

import '../src/config/env.js'; // Load environment variables first
import { createChatCompletion, TEXT_MODEL, validateOpenAIConfig } from '../src/services/openai.js';

async function testOpenRouterAPI() {
  console.log('🧪 Testing OpenRouter API...\n');

  try {
    validateOpenAIConfig();
  } catch (error) {
    console.error('❌ OPENROUTER_API_KEY not found in environment variables');
    console.log('💡 Make sure you have a .env file with OPENROUTER_API_KEY set');
    process.exit(1);
  }

  try {
    const testPrompt = `You are a patient math tutor. NEVER give direct answers. Guide through questions.

Student problem: "Solve 2x + 5 = 13"

Give your first Socratic question to help the student discover the solution.`;

    console.log('📤 Sending test request...');
    console.log('Model:', TEXT_MODEL);
    console.log('');

    const response = await createChatCompletion({
      model: TEXT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a patient math tutor. NEVER give direct answers. Guide through questions.'
        },
        {
          role: 'user',
          content: testPrompt
        }
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    console.log('✅ OpenRouter API connection successful!');
    console.log('');
    console.log('📥 Response:');
    console.log(response.choices[0].message.content);
    console.log('');
    console.log('📊 Usage:');
    console.log(`   Prompt tokens: ${response.usage.prompt_tokens}`);
    console.log(`   Completion tokens: ${response.usage.completion_tokens}`);
    console.log(`   Total tokens: ${response.usage.total_tokens}`);
    console.log('');
    console.log(`✨ Model used: ${response.model}`);

  } catch (error) {
    console.error('❌ Error testing OpenRouter API:');
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

testOpenRouterAPI();

