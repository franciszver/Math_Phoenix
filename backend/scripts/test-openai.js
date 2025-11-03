/**
 * Test script for OpenAI Text API
 * Verifies API key and tests Socratic dialogue prompt
 */

import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function testTextAPI() {
  console.log('🧪 Testing OpenAI Text API...\n');

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment variables');
    console.log('💡 Make sure you have a .env file with OPENAI_API_KEY set');
    process.exit(1);
  }

  try {
    const testPrompt = `You are a patient math tutor. NEVER give direct answers. Guide through questions.
    
Student problem: "Solve 2x + 5 = 13"

Give your first Socratic question to help the student discover the solution.`;

    console.log('📤 Sending test request...');
    console.log('Prompt:', testPrompt);
    console.log('');

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
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

    console.log('✅ OpenAI API connection successful!');
    console.log('');
    console.log('📥 Response:');
    console.log(response.choices[0].message.content);
    console.log('');
    console.log('📊 Usage:');
    console.log(`   Prompt tokens: ${response.usage.prompt_tokens}`);
    console.log(`   Completion tokens: ${response.usage.completion_tokens}`);
    console.log(`   Total tokens: ${response.usage.total_tokens}`);

  } catch (error) {
    console.error('❌ Error testing OpenAI API:');
    if (error.status === 401) {
      console.error('   Authentication failed. Check your API key.');
    } else if (error.status === 429) {
      console.error('   Rate limit exceeded. Try again later.');
    } else {
      console.error('   ', error.message);
    }
    process.exit(1);
  }
}

testTextAPI();

