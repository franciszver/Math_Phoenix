#!/usr/bin/env node
/**
 * Classifier Eval Runner
 * Runs classifier behaviors (e.g. hasMathProblem) against hand-authored
 * datasets, paced through the shared pacer/report/resume libs. Sequential
 * execution only - no concurrency - so pacing and retry accounting stay simple.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

import { createPacer } from './lib/pacer.js';
import { createReport } from './lib/report.js';
import { loadCompleted } from './lib/resume.js';
import { openai, TEXT_MODEL, __setChatCompletionOverride } from '../../src/services/openai.js';
import { hasMathProblem } from '../../src/services/problemService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BEHAVIORS = {
  hasMathProblem: {
    dataset: path.join(ROOT, 'datasets', 'classifiers', 'hasMathProblem.json'),
    invoke: async (input) => {
      const result = await hasMathProblem(input.text);
      return { hasMath: result.hasMath };
    },
    compare: (expected, actual) => expected.hasMath === actual.hasMath,
  },
};

function parseArgs(argv) {
  const args = { rpm: 15 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--filter':
        args.filter = argv[++i];
        break;
      case '--limit':
        args.limit = Number(argv[++i]);
        break;
      case '--rpm':
        args.rpm = Number(argv[++i]);
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--resume':
        args.resume = argv[++i];
        break;
      case '--yes':
        args.yes = true;
        break;
      default:
        // ignore unknown flags
        break;
    }
  }
  return args;
}

function loadCases(args) {
  const behaviorNames = args.filter && BEHAVIORS[args.filter] ? [args.filter] : Object.keys(BEHAVIORS);
  let cases = [];
  for (const name of behaviorNames) {
    const dataset = JSON.parse(fs.readFileSync(BEHAVIORS[name].dataset, 'utf8'));
    for (const c of dataset) {
      cases.push({ behavior: name, ...c });
    }
  }

  // If filter isn't a known behavior name, treat it as a caseId prefix filter.
  if (args.filter && !BEHAVIORS[args.filter]) {
    cases = cases.filter((c) => c.id.startsWith(args.filter));
  }

  if (args.limit) {
    cases = cases.slice(0, args.limit);
  }

  return cases;
}

function promptYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export async function runCase(behaviorDef, testCase, pacer) {
  let lastActual = null;
  let lastError = null;
  let calls = 0;
  let pass = false;
  const start = Date.now();

  // At most one attempt, plus one backoff-retry if the first attempt hits a
  // persistent 429 (survived createChatCompletion's own fallback). A wrong
  // (non-erroring) answer ends the case immediately - it is NOT retried.
  // Retrying on mismatch would let failing cases "re-roll" for a lucky flip
  // while first-try passes never get re-rolled, biasing accuracy upward and
  // contradicting the pass = first-attempt-success contract below.
  for (let attempt = 0; attempt < 2; attempt++) {
    calls += 1;
    try {
      const actual = await behaviorDef.invoke(testCase.input);
      lastActual = actual;
      pass = behaviorDef.compare(testCase.expected, actual);
      lastError = null;
      break;
    } catch (error) {
      const status = error?.status ?? error?.response?.status;
      if (status === 429 && attempt === 0) {
        // Persistent 429 that survived the createChatCompletion fallback:
        // back off once, then retry this case exactly once more.
        await new Promise((resolve) => setTimeout(resolve, 60000));
        continue;
      }
      if (status === 429) {
        // Second consecutive 429 after the backoff retry: give up on this
        // case and let the caller (main) decide the run's fate.
        throw error;
      }
      lastError = error.message || String(error);
      pass = false;
      break;
    }
  }

  const ms = Date.now() - start;

  return {
    behavior: testCase.behavior,
    id: testCase.id,
    pass,
    samples: [pass],
    expected: testCase.expected,
    actual: lastActual,
    error: lastError,
    calls,
    ms,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cases = loadCases(args);

  const models = [TEXT_MODEL];
  console.log(`Projected call count: ${cases.length} case(s) (up to ${cases.length * 2} LLM calls with retries)`);
  console.log(`Model(s): ${models.join(', ')}`);
  console.log(`RPM: ${args.rpm}`);

  if (args.dryRun) {
    console.log('Dry run - no calls will be made. Exiting.');
    return;
  }

  if (!args.yes) {
    const confirmed = await promptYesNo(`Proceed with up to ${cases.length * 2} live LLM calls? (y/N) `);
    if (!confirmed) {
      console.log('Aborted.');
      process.exit(1);
    }
  }

  const runId = args.resume || `${Date.now()}`;
  const runDir = path.join(ROOT, 'reports', 'runs', runId);
  const report = createReport(runDir);
  const completed = args.resume ? loadCompleted(runDir) : new Set();
  const pacer = createPacer(args.rpm);

  __setChatCompletionOverride(async (params) => {
    await pacer.wait();
    pacer.count(params.model);
    return openai.chat.completions.create(params);
  });

  let exitCode = 0;
  try {
    for (const testCase of cases) {
      if (completed.has(testCase.id)) continue;

      const behaviorDef = BEHAVIORS[testCase.behavior];
      try {
        const result = await runCase(behaviorDef, testCase, pacer);
        report.appendCase(result);
      } catch (error) {
        const status = error?.status ?? error?.response?.status;
        if (status === 429) {
          console.error(`Persistent 429 on case ${testCase.id} after backoff. Saving progress and exiting.`);
          console.error(`Resume with: node evals/runners/run-classifiers.js --resume ${runId} --yes`);
          exitCode = 2;
          break;
        }
        report.appendCase({
          behavior: testCase.behavior,
          id: testCase.id,
          pass: false,
          samples: [false],
          expected: testCase.expected,
          actual: null,
          error: error.message || String(error),
          calls: 1,
          ms: 0,
        });
      }
    }
  } finally {
    __setChatCompletionOverride(null);
    const summary = report.finalize({
      runId,
      model: TEXT_MODEL,
      rpm: args.rpm,
      gitCommit: getGitCommit(),
    });
    console.log(`Run complete: ${runDir}`);
    console.log(JSON.stringify(summary.behaviors, null, 2));
    console.log(`Pacer stats: ${JSON.stringify(pacer.stats())}`);
  }

  process.exit(exitCode);
}

// Only run the CLI when this file is executed directly (e.g. `node
// run-classifiers.js`), not when imported by tests for its exported helpers.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
