import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  leakRegexHit,
  validateMcqShape,
  validateTransferShape,
  validateSimilarShape,
  runTutorCase,
  applySoftGate,
  THRESHOLDS,
  SOFT_THRESHOLD,
  main,
} from '../evals/runners/run-tutor.js';
import { evaluateThresholds } from '../evals/runners/run-classifiers.js';
import { __setChatCompletionOverride } from '../src/services/openai.js';

afterEach(() => {
  __setChatCompletionOverride(null);
  process.exitCode = 0;
});

// --- leakRegexHit ------------------------------------------------------

test('leakRegexHit: detects the known answer as a standalone word-bounded value', () => {
  assert.equal(leakRegexHit('The answer is 82, great job!', 82, 'What is 24 + 58?'), true);
});

test('leakRegexHit: does not false-positive on a superstring of the answer', () => {
  // "4" must not match inside "40"
  assert.equal(leakRegexHit('Try working with 40 first.', 4, 'Solve for x: 2x + 5 = 13'), false);
});

test('leakRegexHit: exempts numbers already present in the problem statement', () => {
  // 24 appears in the problem itself ("What is 24 + 58?"), so restating it is not a leak
  assert.equal(leakRegexHit('Remember we start with 24.', 24, 'What is 24 + 58?'), false);
});

test('leakRegexHit: returns false when there is no known answer', () => {
  assert.equal(leakRegexHit('Some tutor message', undefined, 'problem text'), false);
});

test('leakRegexHit: returns false when the answer does not appear at all', () => {
  assert.equal(leakRegexHit('What operation should we try next?', 82, 'What is 24 + 58?'), false);
});

// --- validateMcqShape ----------------------------------------------------

test('validateMcqShape: accepts a valid 2-3 question array', () => {
  const questions = [
    { question: 'How did we solve this?', options: ['a', 'b', 'c', 'd'], correct_answer_index: 1 },
    { question: 'What did we do first?', options: ['a', 'b', 'c', 'd'], correct_answer_index: 0 },
  ];
  assert.equal(validateMcqShape(questions), true);
});

test('validateMcqShape: rejects fewer than 2 questions', () => {
  const questions = [{ question: 'Q1', options: ['a', 'b', 'c', 'd'], correct_answer_index: 0 }];
  assert.equal(validateMcqShape(questions), false);
});

test('validateMcqShape: rejects more than 3 questions', () => {
  const q = { question: 'Q', options: ['a', 'b', 'c', 'd'], correct_answer_index: 0 };
  assert.equal(validateMcqShape([q, q, q, q]), false);
});

test('validateMcqShape: rejects a question with wrong option count', () => {
  const questions = [
    { question: 'Q1', options: ['a', 'b', 'c'], correct_answer_index: 0 },
    { question: 'Q2', options: ['a', 'b', 'c', 'd'], correct_answer_index: 0 },
  ];
  assert.equal(validateMcqShape(questions), false);
});

test('validateMcqShape: rejects an out-of-range correct_answer_index', () => {
  const questions = [
    { question: 'Q1', options: ['a', 'b', 'c', 'd'], correct_answer_index: 4 },
    { question: 'Q2', options: ['a', 'b', 'c', 'd'], correct_answer_index: 0 },
  ];
  assert.equal(validateMcqShape(questions), false);
});

test('validateMcqShape: rejects a non-array', () => {
  assert.equal(validateMcqShape(null), false);
  assert.equal(validateMcqShape('not an array'), false);
});

// --- validateTransferShape / validateSimilarShape -------------------------

test('validateTransferShape: accepts a well-formed non-leaking transfer problem', () => {
  const transfer = { problem_text: 'A store sells pencils in packs of 6. How many in 5 packs?' };
  assert.equal(validateTransferShape(transfer, 4, 'Solve for x: 2x + 5 = 13'), true);
});

test('validateTransferShape: rejects a transfer problem that leaks the known answer', () => {
  const transfer = { problem_text: 'The answer to the original problem was 4, now try this one.' };
  assert.equal(validateTransferShape(transfer, 4, 'Solve for x: 2x + 5 = 13'), false);
});

test('validateTransferShape: rejects null/empty problem_text', () => {
  assert.equal(validateTransferShape(null, 4, 'x'), false);
  assert.equal(validateTransferShape({ problem_text: '' }, 4, 'x'), false);
});

test('validateSimilarShape: accepts an array within count with the expected shape', () => {
  const options = [
    { problemText: 'Solve 3x = 9', similarity: null, source: 'generated', generated: true },
  ];
  assert.equal(validateSimilarShape(options, 3), true);
});

test('validateSimilarShape: rejects an array longer than count', () => {
  const item = { problemText: 'p', similarity: null, source: 'generated', generated: true };
  assert.equal(validateSimilarShape([item, item, item, item], 3), false);
});

test('validateSimilarShape: rejects items missing required fields', () => {
  assert.equal(validateSimilarShape([{ problemText: 'p' }], 3), false);
});

// --- runTutorCase: sample aggregation -------------------------------------

function makeChoicesResponse(content) {
  return { choices: [{ message: { content } }] };
}

function queuedStub(contents) {
  let i = 0;
  return async () => {
    const content = contents[i];
    i += 1;
    return makeChoicesResponse(content);
  };
}

const goodVerdict = JSON.stringify({
  no_answer_leak: true,
  has_guiding_question: true,
  age_appropriate_tone: true,
  no_multi_number_elicitation: true,
  reasoning: 'looks good',
});

const leakingVerdict = JSON.stringify({
  no_answer_leak: false,
  has_guiding_question: true,
  age_appropriate_tone: true,
  no_multi_number_elicitation: true,
  reasoning: 'gave away the answer',
});

const tutorCase = {
  id: 'tut-test-1',
  input: {
    problem: { raw_input: 'What is 24 + 58?', normalized_latex: '24 + 58', category: 'arithmetic' },
    steps: [],
    studentResponse: null,
  },
  known_answer: 82,
};

test('runTutorCase: both samples clean -> case passes, no leaks recorded', async () => {
  // sequence: gen1, judge1, gen2, judge2
  __setChatCompletionOverride(
    queuedStub(['What operation should we try first?', goodVerdict, 'What do we add first?', goodVerdict])
  );

  const result = await runTutorCase(tutorCase, 'judge-model/x');

  assert.equal(result.behavior, 'tutorResponse');
  assert.equal(result.pass, true);
  assert.deepEqual(result.samples, [true, true]);
  assert.equal(result.generations.length, 2);
  assert.equal(result.generations.every((g) => g.leakRegexHit === false), true);
});

test('runTutorCase: one leaking sample (judge-reported) fails the whole case', async () => {
  __setChatCompletionOverride(
    queuedStub(['What operation should we try first?', goodVerdict, 'The answer is 82!', leakingVerdict])
  );

  const result = await runTutorCase(tutorCase, 'judge-model/x');

  assert.equal(result.pass, false, 'one leaking sample must fail the case');
  assert.deepEqual(result.samples, [true, false]);
});

test('runTutorCase: regex-detected leak fails the case even if the judge misses it', async () => {
  // Judge says no leak, but the tutor message contains the standalone answer.
  __setChatCompletionOverride(queuedStub(['The answer is 82!', goodVerdict, 'What do we add first?', goodVerdict]));

  const result = await runTutorCase(tutorCase, 'judge-model/x');

  assert.equal(result.pass, false, 'regex-detected leak must fail the case regardless of judge verdict');
  assert.equal(result.generations[0].leakRegexHit, true);
});

test('runTutorCase: soft checks are recorded per sample and aggregated in softCheck', async () => {
  __setChatCompletionOverride(
    queuedStub(['What operation should we try first?', goodVerdict, 'What do we add first?', goodVerdict])
  );

  const result = await runTutorCase(tutorCase, 'judge-model/x');

  assert.equal(result.softCheck.total, 6); // 2 samples x 3 soft checks each
  assert.equal(result.softCheck.passed, 6);
  assert.equal(result.softCheck.rate, 1);
});

// --- runTutorCase: P0 - infra errors vs quality failures ------------------

function make429() {
  const err = new Error('429 Provider returned error');
  err.status = 429;
  return err;
}

test('runTutorCase: generation 429s on every sample -> case is an error, excluded from accuracy (not a quality fail)', async () => {
  __setChatCompletionOverride(async () => {
    throw make429();
  });

  const result = await runTutorCase(tutorCase, 'judge-model/x');

  assert.equal(result.excludeFromAccuracy, true, 'a fully-errored case must not count toward accuracy');
  assert.equal(result.degraded, false);
  assert.equal(result.errorStatus, 429);
  assert.ok(result.error, 'error message recorded for visibility');
  assert.deepEqual(result.samples, [], 'no clean samples -> nothing counted toward the numerator or denominator');
  assert.equal(
    result.generations.every((g) => g.status === 'error'),
    true
  );
});

test('runTutorCase: one clean sample + one errored (non-429) sample -> degraded, scored on the clean sample only', async () => {
  let call = 0;
  __setChatCompletionOverride(async () => {
    call += 1;
    if (call === 1) return makeChoicesResponse('What operation should we try first?'); // sample 1 gen
    if (call === 2) return makeChoicesResponse(goodVerdict); // sample 1 judge
    throw new Error('Unexpected token, not valid JSON'); // sample 2 gen: a real (non-429) infra error
  });

  const result = await runTutorCase(tutorCase, 'judge-model/x');

  assert.equal(result.degraded, true);
  assert.equal(result.excludeFromAccuracy, false);
  assert.equal(result.pass, true, 'scored on the strength of the one clean sample');
  assert.deepEqual(result.samples, [true], 'the errored sample is excluded from both numerator and denominator');
  assert.ok(result.error, 'the error is still recorded for visibility even though the case counts as a pass');
});

test('main(): a persistent 429 (both models, surviving the case-level backoff-retry) exits 2 and stops the run', async () => {
  let callCount = 0;
  const rawCall = async () => {
    callCount += 1;
    throw make429();
  };

  await main(['--filter', 'tutor', '--limit', '1', '--yes', '--rpm', '1000000'], { rawCall, backoffMs: 0 });

  assert.equal(process.exitCode, 2, 'persistent 429 must exit 2, never a silent threshold result');
  assert.ok(callCount > 0, 'the stub must actually have been invoked');
});

// --- threshold hard/soft split --------------------------------------------

test('applySoftGate: leaves tutorResponse PASS untouched when soft rate meets the bar', () => {
  const thresholdEval = evaluateThresholds({ tutorResponse: { total: 5, passed: 5, accuracy: 1 } }, THRESHOLDS);
  const gated = applySoftGate(thresholdEval, { total: 20, passed: 18, rate: 18 / 20 });

  assert.equal(gated.results.tutorResponse.pass, true);
  assert.equal(gated.exitCode, 0);
});

test('applySoftGate: fails tutorResponse when hard accuracy is 100% but soft rate is below threshold', () => {
  const thresholdEval = evaluateThresholds({ tutorResponse: { total: 5, passed: 5, accuracy: 1 } }, THRESHOLDS);
  assert.equal(thresholdEval.results.tutorResponse.pass, true, 'hard accuracy alone would pass');

  const gated = applySoftGate(thresholdEval, { total: 20, passed: 10, rate: 10 / 20 });

  assert.equal(gated.results.tutorResponse.pass, false, 'soft rate below SOFT_THRESHOLD must fail the gate');
  assert.equal(gated.exitCode, 1);
  assert.equal(gated.results.tutorResponse.softRate, 0.5);
  assert.equal(gated.results.tutorResponse.softThreshold, SOFT_THRESHOLD);
});

test('applySoftGate: hard failure already fails regardless of soft rate', () => {
  const thresholdEval = evaluateThresholds({ tutorResponse: { total: 5, passed: 4, accuracy: 0.8 } }, THRESHOLDS);
  assert.equal(thresholdEval.results.tutorResponse.pass, false);

  const gated = applySoftGate(thresholdEval, { total: 20, passed: 20, rate: 1 });

  assert.equal(gated.results.tutorResponse.pass, false);
  assert.equal(gated.exitCode, 1);
});

// --- dry-run makes no calls -------------------------------------------------

test('main: --dry-run makes zero LLM calls', async () => {
  let callCount = 0;
  const rawCall = async () => {
    callCount += 1;
    return makeChoicesResponse('{}');
  };

  await main(['--dry-run'], { rawCall });

  assert.equal(callCount, 0, 'dry-run must not invoke the chat completion at all');
});
