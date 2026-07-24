/**
 * Abuse guard middleware for LLM-triggering routes.
 * - perIpLimiter: express-rate-limit, 10 requests/minute per IP.
 * - dailyCapGuard: in-process, date-keyed daily request counter.
 *   Counter resets on process restart by design (in-memory, no persistence).
 */

import rateLimit from 'express-rate-limit';

export const perIpLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests, please try again later.' });
  }
});

const parsed = parseInt(process.env.DAILY_CAP, 10);
let cap = Number.isFinite(parsed) ? parsed : 150;
let count = 0;
let currentDateKey = null;
let nowFn = () => new Date();

function todayKey() {
  return nowFn().toISOString().slice(0, 10);
}

export function dailyCapGuard(req, res, next) {
  const today = todayKey();
  if (today !== currentDateKey) {
    currentDateKey = today;
    count = 0;
  }

  if (count >= cap) {
    return res.status(429).json({ error: 'Daily demo AI limit reached, please try again tomorrow.' });
  }

  count += 1;
  next();
}

/**
 * Test hook: reset the daily counter and optionally override the cap.
 */
export function __resetDailyCap(newCap) {
  count = 0;
  currentDateKey = null;
  if (typeof newCap === 'number') {
    cap = newCap;
  }
}

/**
 * Test hook: inject a clock function for simulating date changes.
 * Pass null to restore the real clock.
 */
export function __setNow(fn) {
  nowFn = fn || (() => new Date());
}
