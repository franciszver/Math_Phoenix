/**
 * API Testing Script
 * Tests the Math Phoenix backend API endpoints
 */

import '../src/config/env.js';
import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

function logTest(name) {
  log(`\n🧪 Testing: ${name}`, 'blue');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'yellow');
}

let sessionCode = null;

async function testHealthCheck() {
  logSection('Health Check');
  try {
    const response = await axios.get(`${API_BASE_URL}/health`);
    logSuccess('Health check passed');
    logInfo(`Response: ${JSON.stringify(response.data, null, 2)}`);
    return true;
  } catch (error) {
    logError(`Health check failed: ${error.message}`);
    if (error.code === 'ECONNREFUSED') {
      logError('Server is not running! Start it with: cd backend && npm run dev');
    }
    return false;
  }
}

async function testCreateSession() {
  logSection('Create Session');
  try {
    logTest('POST /api/sessions (create new)');
    const response = await axios.post(`${API_BASE_URL}/api/sessions`, {});
    
    if (response.data.session_code) {
      sessionCode = response.data.session_code;
      logSuccess(`Session created: ${sessionCode}`);
      logInfo(`Response: ${JSON.stringify(response.data, null, 2)}`);
      return true;
    } else {
      logError('Session code not in response');
      return false;
    }
  } catch (error) {
    logError(`Create session failed: ${error.message}`);
    if (error.response) {
      logError(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

async function testGetSession() {
  logSection('Get Session');
  if (!sessionCode) {
    logError('No session code available');
    return false;
  }

  try {
    logTest(`GET /api/sessions/${sessionCode}`);
    const response = await axios.get(`${API_BASE_URL}/api/sessions/${sessionCode}`);
    
    logSuccess('Session retrieved');
    logInfo(`Response: ${JSON.stringify(response.data, null, 2)}`);
    return true;
  } catch (error) {
    logError(`Get session failed: ${error.message}`);
    if (error.response) {
      logError(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

async function testSubmitTextProblem() {
  logSection('Submit Text Problem');
  if (!sessionCode) {
    logError('No session code available');
    return false;
  }

  try {
    logTest(`POST /api/sessions/${sessionCode}/problems (text)`);
    const problemText = 'Solve for x: 2x + 5 = 13';
    
    logInfo(`Submitting problem: "${problemText}"`);
    
    const response = await axios.post(
      `${API_BASE_URL}/api/sessions/${sessionCode}/problems`,
      { text: problemText },
      { headers: { 'Content-Type': 'application/json' } }
    );

    logSuccess('Problem submitted successfully');
    logInfo(`Session Code: ${response.data.session_code}`);
    logInfo(`Problem ID: ${response.data.problem_id}`);
    logInfo(`Tutor Message: ${response.data.tutor_message}`);
    logInfo(`Category: ${response.data.problem_info?.category}`);
    logInfo(`Difficulty: ${response.data.problem_info?.difficulty}`);
    logInfo(`Full Response: ${JSON.stringify(response.data, null, 2)}`);
    
    return true;
  } catch (error) {
    logError(`Submit problem failed: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

async function testChatMessage() {
  logSection('Send Chat Message');
  if (!sessionCode) {
    logError('No session code available');
    return false;
  }

  try {
    logTest(`POST /api/sessions/${sessionCode}/chat`);
    const studentMessage = 'x';
    
    logInfo(`Sending message: "${studentMessage}"`);
    
    const response = await axios.post(
      `${API_BASE_URL}/api/sessions/${sessionCode}/chat`,
      { message: studentMessage },
      { headers: { 'Content-Type': 'application/json' } }
    );

    logSuccess('Chat message sent successfully');
    logInfo(`Tutor Response: ${response.data.tutor_message}`);
    logInfo(`Step Number: ${response.data.conversation_context?.step_number}`);
    logInfo(`Hints Used: ${response.data.conversation_context?.hints_used}`);
    logInfo(`Progress Made: ${response.data.conversation_context?.progress_made}`);
    logInfo(`Full Response: ${JSON.stringify(response.data, null, 2)}`);
    
    return true;
  } catch (error) {
    logError(`Chat message failed: ${error.message}`);
    if (error.response) {
      logError(`Status: ${error.response.status}`);
      logError(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

async function testMultiTurnConversation() {
  logSection('Multi-Turn Conversation');
  if (!sessionCode) {
    logError('No session code available');
    return false;
  }

  const messages = [
    'x',
    'subtract 5',
    '2x = 8',
    'divide by 2',
    'x = 4'
  ];

  for (let i = 0; i < messages.length; i++) {
    try {
      logTest(`Turn ${i + 1}: "${messages[i]}"`);
      const response = await axios.post(
        `${API_BASE_URL}/api/sessions/${sessionCode}/chat`,
        { message: messages[i] },
        { headers: { 'Content-Type': 'application/json' } }
      );

      logSuccess(`Turn ${i + 1} completed`);
      logInfo(`Tutor: ${response.data.tutor_message}`);
      logInfo(`Progress: ${response.data.conversation_context?.progress_made ? 'Yes' : 'No'}`);
      logInfo(`Stuck Turns: ${response.data.conversation_context?.stuck_turns || 0}`);
      
      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      logError(`Turn ${i + 1} failed: ${error.message}`);
      if (error.response) {
        logError(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      return false;
    }
  }

  return true;
}

async function testSessionResume() {
  logSection('Session Resume');
  if (!sessionCode) {
    logError('No session code available');
    return false;
  }

  try {
    logTest('Creating new session with existing code');
    logInfo(`Attempting to resume session: ${sessionCode}`);
    
    const response = await axios.post(
      `${API_BASE_URL}/api/sessions`,
      { session_code: sessionCode }
    );

    logSuccess('Session resumed successfully');
    logInfo(`Problems in session: ${response.data.problems?.length || 0}`);
    logInfo(`Current Problem ID: ${response.data.current_problem_id || 'None'}`);
    logInfo(`Transcript entries: ${response.data.transcript?.length || 0}`);
    logInfo(`Full Response: ${JSON.stringify(response.data, null, 2)}`);
    
    return true;
  } catch (error) {
    logError(`Session resume failed: ${error.message}`);
    if (error.response) {
      logError(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

async function runAllTests() {
  logSection('Math Phoenix API Test Suite');
  log(`Testing API at: ${API_BASE_URL}`, 'cyan');

  const results = {
    healthCheck: false,
    createSession: false,
    getSession: false,
    submitTextProblem: false,
    chatMessage: false,
    multiTurn: false,
    sessionResume: false
  };

  // Test health check first
  results.healthCheck = await testHealthCheck();
  if (!results.healthCheck) {
    logError('\n⚠️  Server is not running. Please start it first.');
    logInfo('Run: cd backend && npm run dev');
    process.exit(1);
  }

  // Run tests in sequence
  results.createSession = await testCreateSession();
  
  if (results.createSession) {
    results.getSession = await testGetSession();
    results.submitTextProblem = await testSubmitTextProblem();
    
    if (results.submitTextProblem) {
      results.chatMessage = await testChatMessage();
      results.multiTurn = await testMultiTurnConversation();
    }
    
    results.sessionResume = await testSessionResume();
  }

  // Summary
  logSection('Test Summary');
  const total = Object.keys(results).length;
  const passed = Object.values(results).filter(r => r).length;
  const failed = total - passed;

  log(`Total Tests: ${total}`, 'cyan');
  log(`Passed: ${passed}`, 'green');
  log(`Failed: ${failed}`, failed > 0 ? 'red' : 'green');

  Object.entries(results).forEach(([test, result]) => {
    const status = result ? '✅' : '❌';
    log(`${status} ${test}`, result ? 'green' : 'red');
  });

  if (sessionCode) {
    log(`\n📝 Session Code: ${sessionCode}`, 'cyan');
    log(`You can use this code to resume the session in your frontend.`, 'yellow');
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  logError(`\nFatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});

