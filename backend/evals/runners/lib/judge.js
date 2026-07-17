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

const RETRY_NUDGE = 'Respond with ONLY the JSON object. No explanation before or after.';

/**
 * Scan `text` for the first balanced {...} block, respecting JSON string
 * quoting/escaping so braces that appear inside string values (e.g. a
 * "reasoning" field containing literal `{`/`}`) don't throw off the depth
 * count. Returns the matched substring, or null if no balanced block exists.
 * @param {string} text
 * @returns {string|null}
 */
function extractFirstJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function hasAllRequiredFields(verdict) {
  return REQUIRED_FIELDS.every((field) => field in verdict);
}

/**
 * Try to recover a usable verdict object from raw judge response content.
 * Attempt 1: parse `content` as-is with parseLLMJson.
 * Attempt 2 (only if attempt 1 throws): extract the first balanced {...}
 * block from `content` and parse that; only accepted if it has all required
 * fields.
 * @param {string} content
 * @returns {{verdict: object, recovered: boolean}|null} null if unusable
 */
function tryParseVerdict(content) {
  try {
    return { verdict: parseLLMJson(content), recovered: false };
  } catch {
    const block = extractFirstJsonObject(content);
    if (!block) return null;
    try {
      const verdict = parseLLMJson(block);
      if (hasAllRequiredFields(verdict)) {
        return { verdict, recovered: true };
      }
      return null;
    } catch {
      return null;
    }
  }
}

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

  let result = tryParseVerdict(content);
  let finalResponse = response;

  if (!result) {
    // Some judge models (observed: nemotron-3-super) prefix their JSON with
    // reasoning prose even when instructed to respond with JSON only, and
    // the prose can't be recovered via brace-scanning either. Retry once
    // with an extra nudge before giving up.
    const retryResponse = await createChatCompletion({
      model: judgeModel,
      max_tokens: 500,
      temperature: 0.1,
      messages: [
        { role: 'system', content: RETRY_NUDGE },
        { role: 'user', content: prompt },
      ],
    });

    const retryContent = retryResponse.choices?.[0]?.message?.content;
    if (!retryContent) {
      throw new Error('Judge response had no content to parse');
    }

    result = tryParseVerdict(retryContent);
    if (!result) {
      throw new Error('Judge response could not be parsed as JSON');
    }

    finalResponse = retryResponse;
    result.recovered = true; // the retry itself counts as recovery, even if this content parsed cleanly
  }

  const { verdict, recovered } = result;

  for (const field of REQUIRED_FIELDS) {
    if (!(field in verdict)) {
      throw new Error(`Judge verdict missing required field: ${field}`);
    }
  }

  const verdictOut = {
    no_answer_leak: verdict.no_answer_leak,
    has_guiding_question: verdict.has_guiding_question,
    age_appropriate_tone: verdict.age_appropriate_tone,
    no_multi_number_elicitation: verdict.no_multi_number_elicitation,
    reasoning: verdict.reasoning,
    // The model that actually answered, per the API response - may differ
    // from the requested `judgeModel` if OpenRouter (or createChatCompletion's
    // own fallback retry) silently routed to a different underlying model.
    // Surfacing it keeps silent judge-fallbacks visible in reports.
    judgeModelActual: finalResponse.model ?? judgeModel,
  };

  if (recovered) {
    // Visibility into judge flakiness: true whenever attempt 1's direct
    // parseLLMJson call didn't cleanly produce the verdict (brace-scan
    // recovery and/or a retry call were needed).
    verdictOut.parseRecovered = true;
  }

  return verdictOut;
}
