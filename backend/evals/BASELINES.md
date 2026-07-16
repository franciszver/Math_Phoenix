# Eval Baselines

Committed summary numbers per model/date. Full reports live in `reports/` (gitignored).
Regression rule: investigate any drop >10 points from the model's recorded baseline.

## TEXT_MODEL: openai/gpt-oss-20b:free

| Behavior | Accuracy | Cases | Date | Run notes |
|---|---|---|---|---|
| hasMathProblem | **100%** (40/40) | 40 (20 pos / 20 neg, incl. adversarial + prompt-injection negatives) | 2026-07-16 | 40 calls, 177s @ 15 rpm, zero fallback triggers |
