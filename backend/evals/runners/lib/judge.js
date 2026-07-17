/**
 * Eval Judge
 * Uses an LLM (a different "family" than the model under test, where
 * possible) to score a tutor response against the SYSTEM_PROMPT rules in
 * ../../../src/services/socraticEngine.js: no answer leaks, presence of a
 * genuine guiding question, age-appropriate tone, and no multi-number
 * elicitation questions.
 */
import { createChatCompletion } from '../../../src/services/openai.js';
import { parseLLMJson } from '../../../src/utils/parseLLMJson.js';

const LLAMA_FALLBACK = 'meta-llama/llama-3.3-70b-instruct:free';
const GPT_OSS_FALLBACK = 'openai/gpt-oss-20b:free';

function providerFamily(model) {
  if (!model) return '';
  return model.split('/')[0];
}

/**
 * Pick a judge model that is (where possible) a different provider family
 * than the model under test, so the judge isn't grading its own homework.
 * @param {string} modelUnderTest
 * @param {string} [preferred] - defaults to JUDGE_MODEL env var, then a hardcoded default
 * @returns {string} judge model id
 */
export function resolveJudgeModel(
  modelUnderTest,
  preferred = process.env.JUDGE_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free'
) {
  const underFamily = providerFamily(modelUnderTest);
  if (providerFamily(preferred) !== underFamily) return preferred;
  if (providerFamily(LLAMA_FALLBACK) !== underFamily) return LLAMA_FALLBACK;
  return GPT_OSS_FALLBACK;
}

const REQUIRED_FIELDS = [
  'no_answer_leak',
  'has_guiding_question',
  'age_appropriate_tone',
  'no_multi_number_elicitation',
  'reasoning',
];

function buildRubricPrompt({ problemText, knownAnswer, conversationSummary, studentResponse, tutorMessage }) {
  return `You are grading a math tutor's response for a K-12 Socratic tutoring app. The tutor must never give direct answers, must ask guiding questions, must keep an encouraging age-appropriate tone, and must never ask the student to provide multiple numbers in a single turn.

PROBLEM:
${problemText}

KNOWN CORRECT ANSWER (for your reference only - do not reveal this yourself):
${knownAnswer}

CONVERSATION SO FAR (summary):
${conversationSummary}

STUDENT'S LAST MESSAGE:
${studentResponse}

TUTOR'S RESPONSE TO GRADE:
${tutorMessage}

Score the TUTOR'S RESPONSE against these four checks. For each, true means the tutor's response COMPLIES with the rule (true = good):

1. no_answer_leak: true if the tutor's response does NOT state or trivially reveal the final correct answer. Restating numbers that were already given in the problem statement is fine and does not count as a leak. False if the tutor states the final answer or something equivalent to it.

2. has_guiding_question: true if the tutor's response contains at least one genuine guiding/Socratic question that helps the student think through the problem (e.g. "What operation might help us here?", "What should we do next?"). False if the response contains no real guiding question.

3. age_appropriate_tone: true if the tone is warm, encouraging, patient, and appropriate for a K-12 student, with no condescension, sarcasm, or inappropriate content. False otherwise.

4. no_multi_number_elicitation: true if the tutor's response does NOT ask a question that would elicit multiple numbers in a single student reply (e.g. it must NOT ask things like "What numbers are we adding?" or "Which numbers do we use?"). Questions that ask for a single number ("What is the first number?"), or non-numeric/method-based questions ("What operation should we use?", "What step comes next?"), are fine and count as true. False if the question invites a multi-number answer.

Respond with STRICT JSON only, no markdown fences, no extra commentary, in exactly this shape:
{"no_answer_leak": true|false, "has_guiding_question": true|false, "age_appropriate_tone": true|false, "no_multi_number_elicitation": true|false, "reasoning": "brief explanation"}`;
}

/**
 * Judge a single tutor response against the Socratic rubric.
 * @throws if the judge model's response can't be parsed, or is missing a required field.
 */
export async function judgeTutorResponse({
  problemText,
  knownAnswer,
  conversationSummary,
  studentResponse,
  tutorMessage,
  judgeModel,
}) {
  const prompt = buildRubricPrompt({ problemText, knownAnswer, conversationSummary, studentResponse, tutorMessage });

  const response = await createChatCompletion({
    model: judgeModel,
    max_tokens: 500,
    temperature: 0.1,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Judge response had no content to parse');
  }

  const verdict = parseLLMJson(content);

  for (const field of REQUIRED_FIELDS) {
    if (!(field in verdict)) {
      throw new Error(`Judge verdict missing required field: ${field}`);
    }
  }

  return {
    no_answer_leak: verdict.no_answer_leak,
    has_guiding_question: verdict.has_guiding_question,
    age_appropriate_tone: verdict.age_appropriate_tone,
    no_multi_number_elicitation: verdict.no_multi_number_elicitation,
    reasoning: verdict.reasoning,
  };
}
