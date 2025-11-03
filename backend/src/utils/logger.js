/**
 * Logger utility for consistent logging across the application
 * In production, this would integrate with CloudWatch
 */

export function createLogger() {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  return {
    info: (...args) => {
      console.log('[INFO]', new Date().toISOString(), ...args);
    },
    error: (...args) => {
      console.error('[ERROR]', new Date().toISOString(), ...args);
    },
    warn: (...args) => {
      console.warn('[WARN]', new Date().toISOString(), ...args);
    },
    debug: (...args) => {
      if (isDevelopment) {
        console.debug('[DEBUG]', new Date().toISOString(), ...args);
      }
    }
  };
}

