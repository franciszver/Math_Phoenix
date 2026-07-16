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
  const cases = [];

  return {
    appendCase(result) {
      cases.push(result);
      const fd = fs.openSync(resultsPath, 'a');
      fs.writeSync(fd, JSON.stringify(result) + '\n');
      fs.closeSync(fd);
    },
    finalize(meta = {}) {
      const behaviors = {};
      for (const c of cases) {
        const b = behaviors[c.behavior] || { total: 0, passed: 0, accuracy: 0, callCount: 0 };
        b.total += 1;
        b.passed += passFraction(c);
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
      const failed = cases.filter((c) => passFraction(c) < 1);
      const failedSection = failed.length
        ? failed
            .map((c) => `### ${c.id}\n- expected: ${JSON.stringify(c.expected)}\n- actual: ${JSON.stringify(c.actual)}`)
            .join('\n\n')
        : '_none_';
      const md = `# Eval Summary\n\n| Behavior | Total | Passed | Accuracy | Calls |\n| --- | --- | --- | --- | --- |\n${rows}\n\n## Failed Cases\n\n${failedSection}\n`;
      fs.writeFileSync(path.join(runDir, 'summary.md'), md);

      return summary;
    },
  };
}
