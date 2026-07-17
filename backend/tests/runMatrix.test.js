import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseArgs,
  parseRunCompletePath,
  parseStatusLines,
  checkContamination,
  buildComparison,
  renderMarkdown,
  buildChildArgs,
  buildEnv,
  spawnRunner,
} from '../evals/runners/run-matrix.js';

test('parseArgs: required --models is comma-split, --suites defaults to classifiers', () => {
  const args = parseArgs(['--models', 'a/b:free,c/d:free']);
  assert.deepEqual(args.models, ['a/b:free', 'c/d:free']);
  assert.deepEqual(args.suites, ['classifiers']);
});

test('parseArgs: --suites, --rpm, --limit, --yes, --dry-run all parse', () => {
  const args = parseArgs(['--models', 'a', '--suites', 'classifiers,tutor', '--rpm', '10', '--limit', '5', '--yes', '--dry-run']);
  assert.deepEqual(args.suites, ['classifiers', 'tutor']);
  assert.equal(args.rpm, 10);
  assert.equal(args.limit, 5);
  assert.equal(args.yes, true);
  assert.equal(args.dryRun, true);
});

test('buildChildArgs: live run uses --yes, dry run uses --dry-run, both forward rpm/limit', () => {
  const args = { rpm: 20, limit: 3 };
  assert.deepEqual(buildChildArgs(args, { dryRun: false }), ['--yes', '--rpm', '20', '--limit', '3']);
  assert.deepEqual(buildChildArgs(args, { dryRun: true }), ['--dry-run', '--rpm', '20', '--limit', '3']);
});

test('buildEnv: pins TEXT_MODEL_FALLBACK to the same candidate model, not the real default', () => {
  const env = buildEnv('a/b:free');
  assert.equal(env.TEXT_MODEL, 'a/b:free');
  assert.equal(env.TEXT_MODEL_FALLBACK, 'a/b:free');
});

test('parseRunCompletePath: extracts the run dir from a "Run complete:" line', () => {
  const stdout = 'some noise\nRun complete: /tmp/reports/runs/12345\nmore noise\n';
  assert.equal(parseRunCompletePath(stdout), '/tmp/reports/runs/12345');
});

test('parseRunCompletePath: returns null when no such line exists', () => {
  assert.equal(parseRunCompletePath('nothing here'), null);
});

test('parseStatusLines: extracts PASS/FAIL/INCOMPLETE lines with behavior names', () => {
  const stdout = [
    'PASS hasMathProblem: 95.0% (threshold 90.0%)',
    'FAIL validateProblem: 70.0% (threshold 85.0%)',
    'INCOMPLETE detectMultipleProblems: 50.0% (threshold 80.0%) [only 1/2 cases ran]',
  ].join('\n');
  assert.deepEqual(parseStatusLines(stdout), [
    { status: 'PASS', behavior: 'hasMathProblem' },
    { status: 'FAIL', behavior: 'validateProblem' },
    { status: 'INCOMPLETE', behavior: 'detectMultipleProblems' },
  ]);
});

test('checkContamination: passes when summary.model matches the pinned candidate', () => {
  const result = checkContamination('a/b:free', { model: 'a/b:free' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test('checkContamination: flags a summary.model mismatch', () => {
  const result = checkContamination('a/b:free', { model: 'c/d:free' });
  assert.equal(result.ok, false);
  assert.match(result.issues[0], /summary\.model/);
});

test('checkContamination: flags an unexpected model inside summary.byModel', () => {
  const result = checkContamination('a/b:free', { model: 'a/b:free', byModel: { 'a/b:free': 5, 'c/d:free': 2 } });
  assert.equal(result.ok, false);
  assert.match(result.issues[0], /byModel/);
  assert.match(result.issues[0], /c\/d:free/);
});

test('buildComparison: merges two fake summary.json fixtures into a behavior x model table', () => {
  const summaryA = {
    runId: '1',
    model: 'a/b:free',
    behaviors: {
      hasMathProblem: { total: 10, passed: 9, accuracy: 0.9, callCount: 10 },
      validateProblem: { total: 10, passed: 5, accuracy: 0.5, callCount: 10 },
    },
  };
  const summaryB = {
    runId: '2',
    model: 'c/d:free',
    behaviors: {
      hasMathProblem: { total: 10, passed: 10, accuracy: 1.0, callCount: 10 },
      validateProblem: { total: 10, passed: 8, accuracy: 0.8, callCount: 10 },
    },
  };

  const statusLinesA = [
    { status: 'PASS', behavior: 'hasMathProblem' },
    { status: 'FAIL', behavior: 'validateProblem' },
  ];
  const statusLinesB = [
    { status: 'PASS', behavior: 'hasMathProblem' },
    { status: 'INCOMPLETE', behavior: 'validateProblem' },
  ];

  const comparison = buildComparison({
    models: ['a/b:free', 'c/d:free'],
    suites: ['classifiers'],
    entries: [
      { model: 'a/b:free', suite: 'classifiers', summary: summaryA, statusLines: statusLinesA },
      { model: 'c/d:free', suite: 'classifiers', summary: summaryB, statusLines: statusLinesB },
    ],
  });

  assert.equal(comparison.table.hasMathProblem['a/b:free'].accuracy, 0.9);
  assert.equal(comparison.table.hasMathProblem['c/d:free'].accuracy, 1.0);
  assert.equal(comparison.table.validateProblem['a/b:free'].status, 'FAIL');
  assert.equal(comparison.table.validateProblem['c/d:free'].status, 'INCOMPLETE');

  assert.equal(comparison.perModel['a/b:free'].totalCalls, 20);
  assert.deepEqual(comparison.perModel['a/b:free'].incompleteBehaviors, []);
  assert.equal(comparison.perModel['a/b:free'].contamination.ok, true);

  assert.deepEqual(comparison.perModel['c/d:free'].incompleteBehaviors, ['validateProblem']);
  assert.equal(comparison.perModel['c/d:free'].contamination.ok, true);
});

test('buildComparison: flags contamination when a summary names a model other than the pinned candidate', () => {
  const contaminated = {
    model: 'unexpected/model:free',
    behaviors: { hasMathProblem: { total: 5, passed: 5, accuracy: 1, callCount: 5 } },
  };
  const comparison = buildComparison({
    models: ['a/b:free'],
    suites: ['classifiers'],
    entries: [{ model: 'a/b:free', suite: 'classifiers', summary: contaminated, statusLines: [] }],
  });
  assert.equal(comparison.perModel['a/b:free'].contamination.ok, false);
  assert.match(comparison.perModel['a/b:free'].contamination.issues[0], /unexpected\/model:free/);
});

test('renderMarkdown: produces a behavior x model table and a per-model totals section', () => {
  const comparison = buildComparison({
    models: ['a/b:free', 'c/d:free'],
    suites: ['classifiers'],
    entries: [
      {
        model: 'a/b:free',
        suite: 'classifiers',
        summary: { model: 'a/b:free', behaviors: { hasMathProblem: { total: 10, passed: 9, accuracy: 0.9, callCount: 10 } } },
        statusLines: [{ status: 'PASS', behavior: 'hasMathProblem' }],
      },
      {
        model: 'c/d:free',
        suite: 'classifiers',
        summary: { model: 'c/d:free', behaviors: { hasMathProblem: { total: 10, passed: 10, accuracy: 1.0, callCount: 10 } } },
        statusLines: [{ status: 'PASS', behavior: 'hasMathProblem' }],
      },
    ],
  });

  const md = renderMarkdown(comparison);
  assert.match(md, /\| Behavior \| a\/b:free \| c\/d:free \|/);
  assert.match(md, /hasMathProblem/);
  assert.match(md, /90\.0% \(9\/10\) \[PASS\]/);
  assert.match(md, /### a\/b:free/);
  assert.match(md, /Fallback contamination check: OK/);
});

// Light integration check: prove spawnRunner actually captures a real child
// process's stdout (rather than exercising only the string-parsing helpers
// above against hand-written fixtures). Uses `node -e` as a stand-in for a
// real suite runner so this test needs no dataset/network access.
test('spawnRunner: captures stdout from a real child process and its exit code', async () => {
  const tmpRunDir = '/tmp/matrix-fake-run';
  const { code, stdout } = await spawnRunner('-e', [`console.log("Run complete: ${tmpRunDir}")`], process.env);
  assert.equal(code, 0);
  assert.equal(parseRunCompletePath(stdout), tmpRunDir);
});
