# Eval Baselines

Committed summary numbers per model/date. Full reports live in `reports/` (gitignored).
Regression rule: investigate any drop >10 points from the model's recorded baseline.

## TEXT_MODEL: openai/gpt-oss-20b:free — T1 classifiers (2026-07-16)

| Behavior | Accuracy | Threshold | Cases | Notes |
|---|---|---|---|---|
| hasMathProblem | **100%** (40/40) | 90% | 20 pos / 20 neg incl. adversarial + prompt-injection | |
| validateProblem | **100%** (30/30) | 85% | 5 fast-path (0 LLM) + 25 LLM-path | |
| detectMultipleProblems | **100%** (25/25) | 80% | 15 single / 10 multiple (label + count) | |
| detectFormulaRequirement | **80%** (20/25) | 80% | 5 fast-path + 20 LLM-path (no trigger keywords) | At threshold — weakest behavior; failures are keyword-less formula cases. Watch on model swaps. |
| evaluateFormulaKnowledge | **100%** (20/20) | 80% | incl. sloppy notation, hedged answers | |
| detectSolutionCompletion | **86.7%** (26/30) | 85% | completed/intermediate/question-back/tentative | 4 misses in tentative/embedded forms |
| gradeTransferAnswer | **100%** (20/20) | 80% | bare/embedded/units/word-form answers | From standalone rerun (full-run truncation bug, fixed at E2 gate) |

Run stats: ~195 LLM calls total across runs; 11 automatic fallback-model retries (llama-3.3-70b) — all succeeded; pacing 15 rpm.
