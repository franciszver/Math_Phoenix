#!/usr/bin/env node
/**
 * Model Comparison Matrix Runner
 * Runs the classifiers and/or tutor eval suites once per candidate model (by
 * spawning the existing per-suite runners as child processes) and merges
 * their summary.json outputs into a single behavior x model comparison
 * report. Sequential, not parallel: all candidate models share the same
 * OpenRouter rate limit, so running them concurrently would just make every
 * child's own pacer under-count the real request rate.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export const SUITE_SCRIPTS = {
  classifiers: path.join(__dirname, 'run-classifiers.js'),
  tutor: path.join(__dirname, 'run-tutor.js'),
};

export function parseArgs(argv) {
  const args = { models: [], suites: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--models':
        args.models = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case '--suites':
        args.suites = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case '--rpm':
        args.rpm = Number(argv[++i]);
        break;
      case '--limit':
        args.limit = Number(argv[++i]);
        break;
      case '--yes':
        args.yes = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      default:
        // ignore unknown flags
        break;
    }
  }
  if (!args.suites.length) args.suites = ['classifiers'];
  return args;
}

// Extracts the run directory a child runner printed via `console.log(`Run
// complete: ${runDir}`)`. Parsing this line is more robust than scanning
// reports/runs/ for the newest mtime - it works even if two matrix runs (or a
// stray manual run) race on the filesystem at the same moment.
export function parseRunCompletePath(stdout) {
  const match = /^Run complete: (.+)$/m.exec(stdout || '');
  return match ? match[1].trim() : null;
}

// Extracts each per-behavior "STATUS behaviorName: ..." line the child
// runners print at the end of main() (see run-classifiers.js/run-tutor.js).
// Used to know which behaviors a given child flagged INCOMPLETE, since that
// judgment (case count vs. expected count) is computed by the child and only
// surfaced via stdout, not persisted in summary.json.
export function parseStatusLines(stdout) {
  const lines = [];
  const re = /^(PASS|FAIL|INCOMPLETE)\s+(\S+):/gm;
  let match;
  while ((match = re.exec(stdout || '')) !== null) {
    lines.push({ status: match[1], behavior: match[2] });
  }
  return lines;
}

// Fallback-contamination check: with TEXT_MODEL_FALLBACK pinned to the same
// candidate model (see buildEnv below), a summary attributing calls to any
// other model means something bypassed that pin (e.g. a stale env var, or a
// future summary shape change). Checks the top-level `model` field every
// current summary.json has, plus an optional `byModel` breakdown (not
// currently emitted by the runners, but checked defensively in case a future
// summary shape reports per-model call counts directly).
export function checkContamination(candidateModel, summary) {
  const issues = [];
  if (summary.model && summary.model !== candidateModel) {
    issues.push(`summary.model is "${summary.model}", expected pinned model "${candidateModel}"`);
  }
  if (summary.byModel && typeof summary.byModel === 'object') {
    const unexpected = Object.keys(summary.byModel).filter((m) => m !== candidateModel);
    if (unexpected.length) {
      issues.push(`summary.byModel references unexpected model(s): ${unexpected.join(', ')}`);
    }
  }
  return { ok: issues.length === 0, issues, expected: candidateModel, actual: summary.model };
}

// Merges one summary.json + parsed stdout status lines per (model, suite)
// entry into a single behavior x model comparison structure.
export function buildComparison({ models, suites, entries }) {
  const table = {};
  const perModel = {};
  for (const model of models) {
    perModel[model] = { totalCalls: 0, incompleteBehaviors: [], contamination: { ok: true, issues: [] } };
  }

  for (const entry of entries) {
    const { model, summary, statusLines = [] } = entry;
    if (!perModel[model]) {
      perModel[model] = { totalCalls: 0, incompleteBehaviors: [], contamination: { ok: true, issues: [] } };
    }
    const contamination = checkContamination(model, summary);
    if (!contamination.ok) {
      perModel[model].contamination.ok = false;
      perModel[model].contamination.issues.push(...contamination.issues);
    }

    for (const [behavior, b] of Object.entries(summary.behaviors || {})) {
      table[behavior] = table[behavior] || {};
      const statusLine = statusLines.find((s) => s.behavior === behavior);
      table[behavior][model] = {
        accuracy: b.accuracy,
        total: b.total,
        passed: b.passed,
        callCount: b.callCount,
        status: statusLine ? statusLine.status : null,
      };
      perModel[model].totalCalls += b.callCount || 0;
      if (statusLine && statusLine.status === 'INCOMPLETE') {
        perModel[model].incompleteBehaviors.push(behavior);
      }
    }
  }

  return { generatedAt: new Date().toISOString(), models, suites, table, perModel };
}

export function renderMarkdown(comparison) {
  const { models, table, perModel } = comparison;
  const behaviors = Object.keys(table).sort();

  const header = `| Behavior | ${models.join(' | ')} |`;
  const divider = `| --- | ${models.map(() => '---').join(' | ')} |`;
  const rows = behaviors.map((behavior) => {
    const cells = models.map((model) => {
      const cell = table[behavior][model];
      if (!cell) return '_no data_';
      const status = cell.status ? ` [${cell.status}]` : '';
      return `${(cell.accuracy * 100).toFixed(1)}% (${cell.passed}/${cell.total})${status}`;
    });
    return `| ${behavior} | ${cells.join(' | ')} |`;
  });

  const perModelSection = models
    .map((model) => {
      const m = perModel[model];
      const incomplete = m.incompleteBehaviors.length ? m.incompleteBehaviors.join(', ') : '_none_';
      const contamination = m.contamination.ok ? 'OK' : `FLAGGED - ${m.contamination.issues.join('; ')}`;
      return `### ${model}\n- Total calls: ${m.totalCalls}\n- INCOMPLETE behaviors: ${incomplete}\n- Fallback contamination check: ${contamination}`;
    })
    .join('\n\n');

  return `# Model Comparison Matrix\n\nGenerated: ${comparison.generatedAt}\nSuites: ${comparison.suites.join(', ')}\n\n${header}\n${divider}\n${rows.join('\n')}\n\n## Per-Model Totals\n\n${perModelSection}\n`;
}

// Fallback is pinned to the candidate model itself (not the service's real
// TEXT_MODEL_FALLBACK default). If it were left as the real fallback, a 429
// or empty-response retry inside createChatCompletion (src/services/
// openai.js) would silently serve some calls from a *different* model while
// still attributing the whole run's summary.json to the candidate - exactly
// the kind of undetectable cross-model contamination this matrix runner
// exists to rule out.
export function buildEnv(model) {
  return { ...process.env, TEXT_MODEL: model, TEXT_MODEL_FALLBACK: model };
}

export function buildChildArgs(args, { dryRun }) {
  const out = [dryRun ? '--dry-run' : '--yes'];
  if (args.rpm !== undefined && !Number.isNaN(args.rpm)) out.push('--rpm', String(args.rpm));
  if (args.limit !== undefined && !Number.isNaN(args.limit)) out.push('--limit', String(args.limit));
  return out;
}

// Spawns `node <scriptPath> ...args` with the given env, mirroring its stdout
// to this process's stdout (so a long matrix run stays observable) while
// also buffering it for `parseRunCompletePath`/`parseStatusLines`. stderr is
// simply inherited.
export function spawnRunner(scriptPath, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], { env });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.pipe(process.stderr);
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout }));
  });
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

export async function main(argv = process.argv.slice(2), { spawnFn = spawnRunner } = {}) {
  const args = parseArgs(argv);

  if (!args.models.length) {
    console.error('--models <comma-separated ids> is required');
    process.exit(1);
    return;
  }
  for (const suite of args.suites) {
    if (!SUITE_SCRIPTS[suite]) {
      console.error(`Unknown suite "${suite}". Known suites: ${Object.keys(SUITE_SCRIPTS).join(', ')}`);
      process.exit(1);
      return;
    }
  }

  console.log(`Models: ${args.models.join(', ')}`);
  console.log(`Suites: ${args.suites.join(', ')}`);

  if (args.dryRun) {
    for (const model of args.models) {
      for (const suite of args.suites) {
        console.log(`\n=== Dry run: model=${model} suite=${suite} ===`);
        const childArgs = buildChildArgs(args, { dryRun: true });
        const { code } = await spawnFn(SUITE_SCRIPTS[suite], childArgs, buildEnv(model));
        if (code !== 0) {
          console.error(`Dry-run child exited with code ${code} for model=${model} suite=${suite}`);
        }
      }
    }
    process.exit(0);
    return;
  }

  if (!args.yes) {
    const confirmed = await promptYesNo(
      `Proceed with live eval runs across ${args.models.length} model(s) x ${args.suites.length} suite(s)? (y/N) `
    );
    if (!confirmed) {
      console.log('Aborted.');
      process.exit(1);
      return;
    }
  }

  const entries = [];
  let quotaHit = false;

  modelLoop: for (const model of args.models) {
    for (const suite of args.suites) {
      console.log(`\n=== Running suite=${suite} model=${model} ===`);
      const childArgs = buildChildArgs(args, { dryRun: false });
      const { code, stdout } = await spawnFn(SUITE_SCRIPTS[suite], childArgs, buildEnv(model));

      if (code === 2) {
        console.error(`\nModel "${model}" hit quota (exit code 2) on suite "${suite}".`);
        console.error('Aborting remaining models - quota is presumed shared across models on the same key.');
        console.error('Resume this matrix tomorrow once quota resets (rerun with the same --models/--suites).');
        quotaHit = true;
        break modelLoop;
      }

      const runPath = parseRunCompletePath(stdout);
      if (!runPath) {
        console.error(`Could not find a "Run complete:" line for model=${model} suite=${suite}; skipping from comparison.`);
        continue;
      }
      const summaryPath = path.join(runPath, 'summary.json');
      if (!fs.existsSync(summaryPath)) {
        console.error(`summary.json not found at ${summaryPath}; skipping from comparison.`);
        continue;
      }
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      entries.push({ model, suite, runDir: runPath, summary, statusLines: parseStatusLines(stdout), exitCode: code });
    }
  }

  const comparison = buildComparison({ models: args.models, suites: args.suites, entries });
  const outDir = path.join(ROOT, 'reports', `matrix-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'comparison.json'), JSON.stringify(comparison, null, 2));
  fs.writeFileSync(path.join(outDir, 'comparison.md'), renderMarkdown(comparison));
  console.log(`\nMatrix comparison written to ${outDir}`);

  process.exit(quotaHit ? 2 : 0);
}

// Only run the CLI when this file is executed directly (e.g. `node
// run-matrix.js`), not when imported by tests for its exported helpers.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
