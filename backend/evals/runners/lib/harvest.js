#!/usr/bin/env node
/**
 * Dataset Harvest Script
 * Read-only transcript harvester for dataset curation.
 * Logs into the dashboard, lists sessions, fetches details, and writes JSON files.
 *
 * Usage:
 *   node harvest.js [--url http://localhost:3001] [--out ../datasets/harvested]
 *
 * Environment:
 *   DASHBOARD_PASSWORD  - Password for dashboard authentication (required)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../../.env') });

// Parse command-line arguments
function parseArgs(argv) {
  const args = {
    url: 'http://localhost:3001',
    out: path.join(__dirname, '../datasets/harvested'),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--url':
        args.url = argv[++i];
        break;
      case '--out':
        args.out = argv[++i];
        break;
      default:
        break;
    }
  }

  return args;
}

/**
 * Login to dashboard and get auth token
 */
async function login(baseUrl, password) {
  const url = `${baseUrl}/api/dashboard/login`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid dashboard password');
      }
      throw new Error(`Login failed with status ${response.status}`);
    }

    const data = await response.json();
    if (!data.token) {
      throw new Error('No token received from login');
    }

    return data.token;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Connection timeout after 5s at ${baseUrl} - is the server running?`);
    }
    throw new Error(`Failed to connect to server at ${baseUrl}: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get all sessions from dashboard
 */
async function getSessions(baseUrl, token) {
  const url = `${baseUrl}/api/dashboard/sessions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sessions: ${response.status}`);
    }

    const data = await response.json();
    return data.sessions || [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get detailed session information
 */
async function getSessionDetails(baseUrl, token, sessionCode) {
  const url = `${baseUrl}/api/dashboard/sessions/${sessionCode}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch session ${sessionCode}: ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Transform session details to harvest format
 */
function transformSessionData(session) {
  return {
    session_code: session.session_code,
    created_at: session.created_at,
    problems: (session.problems || []).map((p) => ({
      problem_id: p.problem_id,
      raw_input: p.raw_input || '',
      normalized_latex: p.normalized_latex || '',
      category: p.category || 'other',
      difficulty: p.difficulty || 'unknown',
      completed: p.completed || false,
      hints_used: p.hints_used || 0,
      created_at: p.created_at,
    })),
    transcript: session.transcript || [],
  };
}

/**
 * Ensure output directory exists
 */
function ensureOutputDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write session data to JSON file
 */
function writeSessionFile(outputDir, sessionCode, data) {
  const filePath = path.join(outputDir, `${sessionCode}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

/**
 * Main harvest function
 */
async function harvest(args) {
  // Validate password
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    console.error('Error: DASHBOARD_PASSWORD environment variable not set');
    process.exit(1);
  }

  // Create output directory
  ensureOutputDir(args.out);

  let token;
  let sessions;

  // Login
  try {
    console.log(`Logging into dashboard at ${args.url}...`);
    token = await login(args.url, password);
    console.log('Login successful');
  } catch (error) {
    console.error(`Failed to login: ${error.message}`);
    process.exit(1);
  }

  // Get sessions list
  try {
    console.log('Fetching session list...');
    sessions = await getSessions(args.url, token);
    console.log(`Found ${sessions.length} session(s)`);
  } catch (error) {
    console.error(`Failed to fetch sessions: ${error.message}`);
    process.exit(1);
  }

  // Filter out COLLAB- sessions and fetch details
  const filteredSessions = sessions.filter((s) => !s.session_code?.startsWith('COLLAB-'));
  const skippedCount = sessions.length - filteredSessions.length;

  if (skippedCount > 0) {
    console.log(`Skipping ${skippedCount} collaboration session(s)`);
  }

  let harvestedCount = 0;
  const errors = [];

  for (const session of filteredSessions) {
    try {
      const sessionCode = session.session_code;
      console.log(`Harvesting session ${sessionCode}...`);

      const details = await getSessionDetails(args.url, token, sessionCode);
      const transformed = transformSessionData(details);
      const filePath = writeSessionFile(args.out, sessionCode, transformed);

      harvestedCount++;
      console.log(`  Saved to ${path.relative(process.cwd(), filePath)}`);
    } catch (error) {
      errors.push({
        sessionCode: session.session_code,
        error: error.message,
      });
      console.error(`  Failed: ${error.message}`);
    }
  }

  // Print summary
  console.log('\n--- Harvest Summary ---');
  console.log(`Sessions harvested: ${harvestedCount}`);
  console.log(`Sessions skipped (COLLAB-): ${skippedCount}`);
  if (errors.length > 0) {
    console.log(`Sessions failed: ${errors.length}`);
  }
  console.log(`Output directory: ${path.resolve(args.out)}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const err of errors) {
      console.log(`  ${err.sessionCode}: ${err.error}`);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (process.argv[1] === __filename) {
  const args = parseArgs(process.argv.slice(2));
  harvest(args).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { harvest, parseArgs };
