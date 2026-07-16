/**
 * Eval Pacer
 * Simple token-bucket-style rate limiter for pacing LLM calls during eval runs.
 * wait() delays just enough to keep calls at or under the configured rate
 * (requests per minute); count()/stats() track call volume per model.
 */

export function createPacer(rpm = 15) {
  const minInterval = 60000 / rpm;
  let nextAvailable = 0;
  let totalCalls = 0;
  const byModel = {};
  const start = Date.now();

  return {
    async wait() {
      const now = Date.now();
      const scheduled = Math.max(now, nextAvailable);
      nextAvailable = scheduled + minInterval;
      const delay = scheduled - now;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    },
    count(model) {
      totalCalls += 1;
      byModel[model] = (byModel[model] || 0) + 1;
    },
    stats() {
      return {
        totalCalls,
        byModel: { ...byModel },
        elapsedMs: Date.now() - start,
      };
    },
  };
}
