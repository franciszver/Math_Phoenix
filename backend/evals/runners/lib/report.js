/**
 * Eval Report Writer
 * Streams per-case results to results.jsonl (flushed on every call so a
 * crash mid-run loses at most the in-flight case) and produces aggregate
 * summary.json / summary.md once a run finishes.
 */
import fs from 'node:fs';
import path from 'node:path';

function passFraction(result) {
  if (Array.isArray(result.samples)) {
    return result.samples.length ? result.samples.filter(Boolean).length / result.samples.length : 0;
  }
  return result.pass ? 1 : 0;
}

export function createReport(runDir) {
  fs.mkdirSync(runDir, { recursive: true });
  const resultsPath = path.join(runDir, 'results.jsonl');
  // Opened once and kept open for the life of the run rather than
  // open+write+close per case: fs.writeSync is already synchronous (each
  // case's line reaches the OS before appendCase returns), so this keeps the
  // "flushed on every call" durability intent without a syscall pair per case.
  const resultsFd = fs.openSync(resultsPath, 'a');
  const cases = [];
  // Cache passFraction(c) alongside each case so finalize() doesn't
  // recompute it a second time for the failed-cases section below.
  const fractions = new WeakMap();

  return {
    appendCase(result) {
      cases.push(result);
      fs.writeSync(resultsFd, JSON.stringify(result) + '\n');
    },
    finalize(meta = {}) {
      const behaviors = {};
      for (const c of cases) {
        fractions.set(c, passFraction(c));
        // A case that produced zero usable signal (every sample's
        // generation/judge call errored - see run-tutor.js's
        // `excludeFromAccuracy`) is still written to results.jsonl/the
        // failed-cases section below for visibility, but is deliberately
        // left out of the accuracy numerator AND denominator: an infra
        // failure is not evidence of good or bad quality.
        if (c.excludeFromAccuracy) continue;
        const b = behaviors[c.behavior] || { total: 0, passed: 0, accuracy: 0, callCount: 0 };
        b.total += 1;
        b.passed += fractions.get(c);
        b.callCount += Array.isArray(c.samples) ? c.samples.length : c.callCount || 1;
        behaviors[c.behavior] = b;
      }
      for (const b of Object.values(behaviors)) {
        b.accuracy = b.total ? b.passed / b.total : 0;
      }

      const summary = { ...meta, behaviors };
      fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));

      const rows = Object.entries(behaviors)
        .map(([name, b]) => `| ${name} | ${b.total} | ${b.passed.toFixed(2)} | ${(b.accuracy * 100).toFixed(1)}% | ${b.callCount} |`)
        .join('\n');
      const failed = cases.filter((c) => fractions.get(c) < 1);
      const failedSection = failed.length
        ? failed
            .map((c) => `### ${c.id}\n- expected: ${JSON.stringify(c.expected)}\n- actual: ${JSON.stringify(c.actual)}`)
            .join('\n\n')
        : '_none_';
      const md = `# Eval Summary\n\n| Behavior | Total | Passed | Accuracy | Calls |\n| --- | --- | --- | --- | --- |\n${rows}\n\n## Failed Cases\n\n${failedSection}\n`;
      fs.writeFileSync(path.join(runDir, 'summary.md'), md);

      fs.closeSync(resultsFd);

      return summary;
    },
  };
}
