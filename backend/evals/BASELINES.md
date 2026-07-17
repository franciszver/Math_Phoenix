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

## TEXT_MODEL: openai/gpt-oss-20b:free — T2 tutor quality (2026-07-17) — PARTIAL

Run 1784256847190 (+1 resume) hit persistent upstream 429s; treat as data, not a validated baseline.

| Suite | Result | Threshold | Status |
|---|---|---|---|
| tutorResponse hard (no_answer_leak) | 9/9 judged clean | 100% | **INCOMPLETE** (9/25 cases — near-answer scenarios, where the known leak defect lives, never ran) |
| tutorResponse soft aggregate | 84.8% (28/33) | 85% | borderline — misses concentrated in `no_multi_number_elicitation` (real, repeated) |
| mcq / transfer / similar | not run | 90% | INCOMPLETE (quota) |

Known defects tracked (from judge calibration, 11 samples / 100% human agreement):
1. Near-answer states: tutor states the final answer instead of asking the last question (hard-gate violation).
2. Open "what information do we have?" openers elicit multiple numbers (soft-check violation).
Rerun `npm run eval:tutor -- --yes` on a fresh quota day for the clean baseline; expect the hard gate to FAIL until the prompt is fixed.

## MODEL MATRIX — classifiers (2026-07-17) — matrix-1784260247909

| Behavior | gpt-oss-20b:free | nemotron-3-super-120b-a12b:free |
|---|---|---|
| hasMathProblem | **100%** PASS | 82.5% FAIL |
| validateProblem | **100%** PASS | 96.7% PASS |
| detectMultipleProblems | **100%** PASS | 100% PASS |
| detectFormulaRequirement | **80%** PASS | 76% FAIL |
| evaluateFormulaKnowledge | **100%** PASS | 100% PASS |
| detectSolutionCompletion | **86.7%** PASS | 80% FAIL |
| gradeTransferAnswer | **100%** PASS | 95% PASS |

Both models: 190/190 cases, 0 INCOMPLETE, fallback contamination check OK. nemotron needed 29 fallback retries + 7 empty-completion recoveries (less stable free-tier endpoint at rpm 12); similar wall clock (~21.5 min each).

**DECISION (2026-07-17): keep `openai/gpt-oss-20b:free` as TEXT_MODEL.** It wins or ties every behavior; nemotron-120b never wins one and fails 3/7 thresholds (worst: −17.5 pts on hasMathProblem). Scope caveat: tutor-quality suites not yet matrixed.
