import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { __setChatCompletionOverride } from '../src/services/openai.js';
import { resolveJudgeModel, judgeTutorResponse } from '../evals/runners/lib/judge.js';

afterEach(() => {
  __setChatCompletionOverride(null);
  delete process.env.JUDGE_MODEL;
});

// --- resolveJudgeModel ---

test('resolveJudgeModel: no family collision returns preferred', () => {
  const result = resolveJudgeModel('openai/gpt-oss-20b:free', 'nvidia/nemotron-3-super-120b-a12b:free');
  assert.equal(result, 'nvidia/nemotron-3-super-120b-a12b:free');
});

test('resolveJudgeModel: nvidia-vs-nvidia collision falls back to llama', () => {
  const result = resolveJudgeModel('nvidia/nemotron-nano-12b-v2-vl:free', 'nvidia/nemotron-3-super-120b-a12b:free');
  assert.equal(result, 'meta-llama/llama-3.3-70b-instruct:free');
});

test('resolveJudgeModel: llama-under-test with llama preferred falls back to gpt-oss', () => {
  const result = resolveJudgeModel('meta-llama/llama-3.1-8b-instruct:free', 'meta-llama/llama-3.3-70b-instruct:free');
  assert.equal(result, 'openai/gpt-oss-20b:free');
});

test('resolveJudgeModel: default preferred is used when no arg given (no collision case)', () => {
  const result = resolveJudgeModel('openai/gpt-oss-20b:free');
  assert.equal(result, 'nvidia/nemotron-3-super-120b-a12b:free');
});

test('resolveJudgeModel: JUDGE_MODEL env var override is respected', () => {
  process.env.JUDGE_MODEL = 'anthropic/claude-3-haiku:free';
  const result = resolveJudgeModel('openai/gpt-oss-20b:free');
  assert.equal(result, 'anthropic/claude-3-haiku:free');
});

test('resolveJudgeModel: JUDGE_MODEL env override still falls back on collision', () => {
  process.env.JUDGE_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';
  const result = resolveJudgeModel('nvidia/nemotron-nano-12b-v2-vl:free');
  assert.equal(result, 'meta-llama/llama-3.3-70b-instruct:free');
});

// --- judgeTutorResponse ---

const baseArgs = {
  problemText: 'A train travels 60 miles in 2 hours. What is its speed?',
  knownAnswer: '30 mph',
  conversationSummary: 'Student is trying to figure out how to combine the numbers.',
  studentResponse: 'I think we divide?',
  tutorMessage: 'Great thinking! What operation might help us compare distance and time?',
  judgeModel: 'meta-llama/llama-3.3-70b-instruct:free',
};

test('judgeTutorResponse: strict JSON response is parsed into a full verdict', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    return {
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      choices: [
        {
          message: {
            content: JSON.stringify({
              no_answer_leak: true,
              has_guiding_question: true,
              age_appropriate_tone: true,
              no_multi_number_elicitation: true,
              reasoning: 'Tutor asked a single guiding question without revealing the answer.',
            }),
          },
        },
      ],
    };
  });

  const verdict = await judgeTutorResponse(baseArgs);

  assert.deepEqual(verdict, {
    no_answer_leak: true,
    has_guiding_question: true,
    age_appropriate_tone: true,
    no_multi_number_elicitation: true,
    reasoning: 'Tutor asked a single guiding question without revealing the answer.',
    judgeModelActual: 'meta-llama/llama-3.3-70b-instruct:free',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, baseArgs.judgeModel);
  assert.equal(calls[0].max_tokens, 500);
  assert.equal(calls[0].temperature, 0.1);
  const prompt = calls[0].messages[0].content;
  assert.ok(prompt.includes(baseArgs.tutorMessage), 'prompt should include the tutor message');
  assert.ok(prompt.includes(baseArgs.knownAnswer), 'prompt should include the known answer');
});

test('judgeTutorResponse: fence-wrapped JSON is parsed', async () => {
  __setChatCompletionOverride(async () => ({
    choices: [
      {
        message: {
          content:
            '```json\n' +
            JSON.stringify({
              no_answer_leak: false,
              has_guiding_question: false,
              age_appropriate_tone: true,
              no_multi_number_elicitation: false,
              reasoning: 'Tutor stated the answer directly.',
            }) +
            '\n```',
        },
      },
    ],
  }));

  const verdict = await judgeTutorResponse(baseArgs);

  assert.equal(verdict.no_answer_leak, false);
  assert.equal(verdict.has_guiding_question, false);
  assert.equal(verdict.age_appropriate_tone, true);
  assert.equal(verdict.no_multi_number_elicitation, false);
  assert.equal(verdict.reasoning, 'Tutor stated the answer directly.');
});

test('judgeTutorResponse: judgeModelActual reflects the API response model, not the requested one, so a silent fallback is visible', async () => {
  __setChatCompletionOverride(async () => ({
    model: 'openai/gpt-oss-20b:free', // createChatCompletion silently fell back to a different model than requested
    choices: [
      {
        message: {
          content: JSON.stringify({
            no_answer_leak: true,
            has_guiding_question: true,
            age_appropriate_tone: true,
            no_multi_number_elicitation: true,
            reasoning: 'fine',
          }),
        },
      },
    ],
  }));

  const verdict = await judgeTutorResponse(baseArgs);

  assert.equal(verdict.judgeModelActual, 'openai/gpt-oss-20b:free');
  assert.notEqual(verdict.judgeModelActual, baseArgs.judgeModel);
});

test('judgeTutorResponse: judgeModelActual falls back to the requested judgeModel if the response has no model field', async () => {
  __setChatCompletionOverride(async () => ({
    choices: [
      {
        message: {
          content: JSON.stringify({
            no_answer_leak: true,
            has_guiding_question: true,
            age_appropriate_tone: true,
            no_multi_number_elicitation: true,
            reasoning: 'fine',
          }),
        },
      },
    ],
  }));

  const verdict = await judgeTutorResponse(baseArgs);

  assert.equal(verdict.judgeModelActual, baseArgs.judgeModel);
});

test('judgeTutorResponse: missing field throws', async () => {
  __setChatCompletionOverride(async () => ({
    choices: [
      {
        message: {
          content: JSON.stringify({
            no_answer_leak: true,
            has_guiding_question: true,
            age_appropriate_tone: true,
            // no_multi_number_elicitation missing
            reasoning: 'incomplete',
          }),
        },
      },
    ],
  }));

  await assert.rejects(() => judgeTutorResponse(baseArgs));
});

test('judgeTutorResponse: unparseable content throws', async () => {
  __setChatCompletionOverride(async () => ({
    choices: [{ message: { content: 'this is not json at all' } }],
  }));

  await assert.rejects(() => judgeTutorResponse(baseArgs));
});

// --- parse recovery (E3.4b) ---

const fullVerdict = {
  no_answer_leak: true,
  has_guiding_question: true,
  age_appropriate_tone: true,
  no_multi_number_elicitation: true,
  reasoning: 'Tutor asked a single guiding question without revealing the answer.',
};

test('judgeTutorResponse: prose-prefixed JSON is recovered via brace-scan without a retry call', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    return {
      model: 'nvidia/nemotron-3-super-120b-a12b:free',
      choices: [
        { message: { content: `We need to check the tutor's response carefully.\n${JSON.stringify(fullVerdict)}` } },
      ],
    };
  });

  const verdict = await judgeTutorResponse(baseArgs);

  assert.equal(calls.length, 1);
  assert.equal(verdict.parseRecovered, true);
  assert.equal(verdict.no_answer_leak, true);
  assert.equal(verdict.reasoning, fullVerdict.reasoning);
});

test('judgeTutorResponse: clean JSON leaves parseRecovered absent', async () => {
  __setChatCompletionOverride(async () => ({
    choices: [{ message: { content: JSON.stringify(fullVerdict) } }],
  }));

  const verdict = await judgeTutorResponse(baseArgs);

  assert.equal(verdict.parseRecovered, undefined);
});

test('judgeTutorResponse: unrecoverable prose triggers one retry with a JSON-only nudge, then succeeds on clean retry content', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    if (calls.length === 1) {
      return {
        choices: [
          {
            message: {
              content: 'I am still thinking this through and have not reached a conclusion about the JSON yet.',
            },
          },
        ],
      };
    }
    return { choices: [{ message: { content: JSON.stringify(fullVerdict) } }] };
  });

  const verdict = await judgeTutorResponse(baseArgs);

  assert.equal(calls.length, 2);
  assert.equal(verdict.parseRecovered, true);
  const retryMessages = calls[1].messages;
  assert.ok(
    retryMessages.some((m) => m.content.includes('Respond with ONLY the JSON object')),
    'retry call should include the JSON-only nudge'
  );
});

test('judgeTutorResponse: unusable content on both the initial call and the retry throws', async () => {
  const calls = [];
  __setChatCompletionOverride(async (params) => {
    calls.push(params);
    return { choices: [{ message: { content: 'no json here, just prose, sorry' } }] };
  });

  await assert.rejects(() => judgeTutorResponse(baseArgs));
  assert.equal(calls.length, 2);
});

test('judgeTutorResponse: brace-scan ignores braces inside a reasoning string when finding the balanced block', async () => {
  const verdictWithBraces = {
    ...fullVerdict,
    reasoning: 'Compare the sets {1,2,3} and {4,5} to see which operation applies.',
  };
  __setChatCompletionOverride(async () => ({
    choices: [
      { message: { content: `We need to think about this. ${JSON.stringify(verdictWithBraces)} Done.` } },
    ],
  }));

  const verdict = await judgeTutorResponse(baseArgs);

  assert.equal(verdict.parseRecovered, true);
  assert.equal(verdict.reasoning, verdictWithBraces.reasoning);
});
