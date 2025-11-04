/**
 * Generate Phoenix-themed assets using OpenAI DALL-E
 * Creates:
 * 1. Phoenix Tutor Avatar (profile picture)
 * 2. Math Phoenix Logo
 */

import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from root directory (parent of backend/)
dotenv.config({ path: path.join(__dirname, '../../.env') });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Download image from URL and save to file
 */
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }
      
      const fileStream = fs.createWriteStream(filepath);
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(filepath);
      });
      
      fileStream.on('error', (err) => {
        fs.unlink(filepath, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

/**
 * Generate Phoenix Tutor Avatar
 */
async function generateTutorAvatar() {
  console.log('🔥 Generating Phoenix Tutor Avatar...\n');
  
  const prompt = `A friendly, approachable phoenix bird character designed as a math tutor avatar. 
    The phoenix should be stylized and cartoon-like, with warm colors (oranges, reds, golds). 
    It should have a kind, encouraging expression suitable for teaching students. 
    The character should be facing forward, with a professional yet friendly appearance. 
    Include subtle mathematical elements like geometric patterns in the feathers or a small equation symbol. 
    Clean, simple design that works well as a profile picture at small sizes. 
    White or transparent background. 
    Style: modern digital illustration, clean lines, vibrant colors.`;
  
  try {
    console.log('📤 Requesting image generation from DALL-E...');
    
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      style: 'vivid'
    });
    
    const imageUrl = response.data[0].url;
    console.log('✅ Image generated successfully!');
    console.log(`📥 Download URL: ${imageUrl}`);
    
    // Create assets directory if it doesn't exist
    // __dirname is backend/scripts, so we go up two levels to root, then into frontend/public/assets
    const assetsDir = path.join(__dirname, '../../frontend/public/assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }
    
    // Download and save
    const avatarPath = path.join(assetsDir, 'phoenix-tutor-avatar.png');
    await downloadImage(imageUrl, avatarPath);
    console.log(`💾 Saved to: ${avatarPath}`);
    
    return avatarPath;
  } catch (error) {
    console.error('❌ Error generating tutor avatar:');
    if (error.status === 401) {
      console.error('   Authentication failed. Check your API key.');
    } else if (error.status === 429) {
      console.error('   Rate limit exceeded. Try again later.');
    } else {
      console.error('   ', error.message);
    }
    throw error;
  }
}

/**
 * Generate Math Phoenix Logo
 */
async function generateLogo() {
  console.log('\n🔥 Generating Math Phoenix Logo...\n');
  
  const prompt = `A professional logo for "Math Phoenix" - an AI-powered math tutoring platform. 
    The logo should combine mathematical and phoenix elements elegantly. 
    Design options: a stylized phoenix bird with mathematical symbols integrated (like equations in the wings, or geometric shapes forming the phoenix), 
    OR a phoenix rising from mathematical symbols/equations, 
    OR a phoenix with a mathematical symbol (like pi, integral, or geometric shapes) as part of its design.
    Colors: warm phoenix colors (oranges, reds, golds) with clean, modern design.
    The logo should be readable at small sizes and work well as a favicon.
    Style: modern, professional, educational, clean vector-style illustration.
    White or transparent background.`;
  
  try {
    console.log('📤 Requesting image generation from DALL-E...');
    
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      style: 'vivid'
    });
    
    const imageUrl = response.data[0].url;
    console.log('✅ Image generated successfully!');
    console.log(`📥 Download URL: ${imageUrl}`);
    
    // Create assets directory if it doesn't exist
    // __dirname is backend/scripts, so we go up two levels to root, then into frontend/public/assets
    const assetsDir = path.join(__dirname, '../../frontend/public/assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }
    
    // Download and save
    const logoPath = path.join(assetsDir, 'math-phoenix-logo.png');
    await downloadImage(imageUrl, logoPath);
    console.log(`💾 Saved to: ${logoPath}`);
    
    return logoPath;
  } catch (error) {
    console.error('❌ Error generating logo:');
    if (error.status === 401) {
      console.error('   Authentication failed. Check your API key.');
    } else if (error.status === 429) {
      console.error('   Rate limit exceeded. Try again later.');
    } else {
      console.error('   ', error.message);
    }
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🎨 Math Phoenix Asset Generator');
  console.log('================================\n');
  
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment variables');
    console.log('💡 Make sure you have a .env file with OPENAI_API_KEY set');
    process.exit(1);
  }
  
  try {
    // Generate tutor avatar
    const avatarPath = await generateTutorAvatar();
    
    // Wait a bit between requests to avoid rate limits
    console.log('\n⏳ Waiting 5 seconds before next request...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Generate logo
    const logoPath = await generateLogo();
    
    console.log('\n✅ All assets generated successfully!');
    console.log('\n📁 Generated files:');
    console.log(`   Avatar: ${avatarPath}`);
    console.log(`   Logo: ${logoPath}`);
    console.log('\n💡 Next steps:');
    console.log('   1. Review the generated images');
    console.log('   2. If needed, regenerate with adjusted prompts');
    console.log('   3. Update the plan to include these assets in the rebranding');
    
  } catch (error) {
    console.error('\n❌ Failed to generate assets');
    process.exit(1);
  }
}

main();

