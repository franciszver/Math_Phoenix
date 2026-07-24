import { useState, useEffect } from 'react';

const DEFAULT_DELAY_MS = 4000;

/**
 * Tracks whether a pending request has been running longer than `delayMs`.
 * Used to surface a "server is waking up" notice on Render's free tier,
 * where cold starts can take up to ~50s, without showing the notice for
 * normal, fast responses.
 *
 * @param {boolean} isPending - whether a request is currently in flight
 * @param {number} [delayMs] - elapsed time before considered "slow"
 * @returns {boolean} isSlow - true once isPending has lasted longer than delayMs
 */
export function useColdStartNotice(isPending, delayMs = DEFAULT_DELAY_MS) {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    if (!isPending) {
      setIsSlow(false);
      return;
    }

    const timer = setTimeout(() => setIsSlow(true), delayMs);
    return () => clearTimeout(timer);
  }, [isPending, delayMs]);

  return isSlow;
}
