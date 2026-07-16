import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { gradeTransferAnswer } from '../src/services/learningAssessmentService.js';
import { __setChatCompletionOverride } from '../src/services/openai.js';

afterEach(() => {
  __setChatCompletionOverride(null);
});

const transferProblem = { problem_text: 'Solve for x: 2x + 4 = 10' };

test('gradeTransferAnswer: happy path parses plain JSON response', async () => {
  __setChatCompletionOverride(async () => ({
    choices: [{
      message: {
        content: '{"is_correct": true, "reasoning": "Correctly isolated x."}'
      }
    }]
  }));

  const result = await gradeTransferAnswer(transferProblem, 'x = 3');

  assert.equal(result.is_correct, true);
  assert.equal(result.reasoning, 'Correctly isolated x.');
});

test('gradeTransferAnswer: parses fence-wrapped JSON response', async () => {
  __setChatCompletionOverride(async () => ({
    choices: [{
      message: {
        content: '```json\n{"is_correct": false, "reasoning": "Wrong value for x."}\n```'
      }
    }]
  }));

  const result = await gradeTransferAnswer(transferProblem, 'x = 100');

  assert.equal(result.is_correct, false);
  assert.equal(result.reasoning, 'Wrong value for x.');
});

test('gradeTransferAnswer: throws when the LLM response is unparseable (matches prior handler behavior)', async () => {
  __setChatCompletionOverride(async () => ({
    choices: [{
      message: {
        content: 'not valid json at all'
      }
    }]
  }));

  await assert.rejects(() => gradeTransferAnswer(transferProblem, 'x = 3'));
});

test('gradeTransferAnswer: propagates rejection when the LLM call fails (matches prior handler behavior)', async () => {
  __setChatCompletionOverride(async () => {
    throw new Error('LLM exploded');
  });

  await assert.rejects(() => gradeTransferAnswer(transferProblem, 'x = 3'));
});
