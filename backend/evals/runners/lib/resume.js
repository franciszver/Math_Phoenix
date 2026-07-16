/**
 * Eval Resume Support
 * Reads a prior run's results.jsonl to determine which case ids already
 * completed, so an interrupted eval run can skip finished cases on restart.
 */
import fs from 'node:fs';
import path from 'node:path';

export function loadCompleted(runDir) {
  const resultsPath = path.join(runDir, 'results.jsonl');
  const completed = new Set();
  if (!fs.existsSync(resultsPath)) {
    return completed;
  }

  const content = fs.readFileSync(resultsPath, 'utf8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const result = JSON.parse(line);
      if (result && result.id) {
        completed.add(result.id);
      }
    } catch {
      // tolerate a trailing partial line left by a crash mid-write
    }
  }
  return completed;
}
