import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPacer } from '../evals/runners/lib/pacer.js';
import { createReport } from '../evals/runners/lib/report.js';
import { loadCompleted } from '../evals/runners/lib/resume.js';

function tmpRunDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evallib-'));
}

// --- pacer.js ---

test('pacer: first call resolves immediately', async () => {
  const pacer = createPacer(15);
  const start = Date.now();
  await pacer.wait();
  assert.ok(Date.now() - start < 50, 'first wait() should not delay');
});

test('pacer: burst is spaced to maintain rpm', async () => {
  const rpm = 1200; // minInterval = 50ms
  const pacer = createPacer(rpm);
  const timestamps = [];
  for (let i = 0; i < 3; i += 1) {
    await pacer.wait();
    timestamps.push(Date.now());
  }
  // Check total span across the burst rather than individual gaps: a single
  // setTimeout overshoot (common on coarse OS timers) can borrow from the
  // next slot and make one gap look shorter, but the cumulative pacing
  // (2 intervals worth) must still hold.
  const totalSpan = timestamps[2] - timestamps[0];
  assert.ok(totalSpan >= 80, `expected ~100ms total span for 2 intervals, got ${totalSpan}ms`);
});

test('pacer: count and stats track totals and per-model tallies', () => {
  const pacer = createPacer(15);
  pacer.count('gpt-4o');
  pacer.count('gpt-4o');
  pacer.count('gpt-4o-mini');
  const stats = pacer.stats();
  assert.equal(stats.totalCalls, 3);
  assert.deepEqual(stats.byModel, { 'gpt-4o': 2, 'gpt-4o-mini': 1 });
  assert.ok(typeof stats.elapsedMs === 'number' && stats.elapsedMs >= 0);
});

// --- report.js ---

test('report: appendCase writes one parseable JSON line per call', () => {
  const runDir = tmpRunDir();
  const report = createReport(runDir);
  report.appendCase({ id: 'c1', behavior: 'b1', expected: 'x', actual: 'x', pass: true });
  report.appendCase({ id: 'c2', behavior: 'b1', expected: 'y', actual: 'z', pass: false });

  const lines = fs
    .readFileSync(path.join(runDir, 'results.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean);
  assert.equal(lines.length, 2);
  const parsed = lines.map((l) => JSON.parse(l));
  assert.equal(parsed[0].id, 'c1');
  assert.equal(parsed[1].id, 'c2');
});

test('report: finalize computes per-behavior aggregates', () => {
  const runDir = tmpRunDir();
  const report = createReport(runDir);
  report.appendCase({ id: 'c1', behavior: 'b1', expected: 'x', actual: 'x', pass: true });
  report.appendCase({ id: 'c2', behavior: 'b1', expected: 'y', actual: 'z', pass: false });
  report.appendCase({ id: 'c3', behavior: 'b2', expected: 'x', actual: 'x', pass: true });

  const summary = report.finalize({ runId: 'run-1' });
  assert.equal(summary.runId, 'run-1');
  assert.equal(summary.behaviors.b1.total, 2);
  assert.equal(summary.behaviors.b1.passed, 1);
  assert.equal(summary.behaviors.b1.accuracy, 0.5);
  assert.equal(summary.behaviors.b2.total, 1);
  assert.equal(summary.behaviors.b2.accuracy, 1);

  const summaryJson = JSON.parse(fs.readFileSync(path.join(runDir, 'summary.json'), 'utf8'));
  assert.equal(summaryJson.behaviors.b1.total, 2);
});

test('report: finalize handles pass-fraction cases via samples array', () => {
  const runDir = tmpRunDir();
  const report = createReport(runDir);
  report.appendCase({
    id: 'c1',
    behavior: 'b1',
    expected: 'x',
    actual: 'mixed',
    samples: [true, true, false, true],
  });

  const summary = report.finalize();
  assert.equal(summary.behaviors.b1.total, 1);
  assert.equal(summary.behaviors.b1.passed, 0.75);
  assert.equal(summary.behaviors.b1.accuracy, 0.75);
  assert.equal(summary.behaviors.b1.callCount, 4);
});

test('report: finalize writes summary.md with behavior rows and failed-case details', () => {
  const runDir = tmpRunDir();
  const report = createReport(runDir);
  report.appendCase({ id: 'c1', behavior: 'b1', expected: 'x', actual: 'x', pass: true });
  report.appendCase({ id: 'c2', behavior: 'b1', expected: 'expected-val', actual: 'actual-val', pass: false });
  report.finalize();

  const md = fs.readFileSync(path.join(runDir, 'summary.md'), 'utf8');
  assert.ok(md.includes('b1'), 'md should contain behavior row');
  assert.ok(md.includes('c2'), 'md should list failed case id');
  assert.ok(md.includes('expected-val'));
  assert.ok(md.includes('actual-val'));
});

// --- resume.js ---

test('resume: missing results.jsonl returns empty set', () => {
  const runDir = tmpRunDir();
  const completed = loadCompleted(runDir);
  assert.equal(completed.size, 0);
});

test('resume: normal file returns all case ids', () => {
  const runDir = tmpRunDir();
  fs.writeFileSync(
    path.join(runDir, 'results.jsonl'),
    `${JSON.stringify({ id: 'c1' })}\n${JSON.stringify({ id: 'c2' })}\n`
  );
  const completed = loadCompleted(runDir);
  assert.deepEqual([...completed].sort(), ['c1', 'c2']);
});

test('resume: tolerates corrupt trailing partial line from a crash mid-write', () => {
  const runDir = tmpRunDir();
  const goodLines = `${JSON.stringify({ id: 'c1' })}\n${JSON.stringify({ id: 'c2' })}\n`;
  const partialLine = '{"id": "c3", "behavior": "b1", "exp';
  fs.writeFileSync(path.join(runDir, 'results.jsonl'), goodLines + partialLine);

  const completed = loadCompleted(runDir);
  assert.deepEqual([...completed].sort(), ['c1', 'c2']);
});
