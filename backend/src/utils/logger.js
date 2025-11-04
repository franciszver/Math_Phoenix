/**
 * Logger utility for consistent logging across the application
 * CloudWatch-ready structured logging for production
 */

export function createLogger() {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  /**
   * Create structured log entry
   * @param {string} level - Log level (info, error, warn, debug)
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  const logStructured = (level, message, metadata = {}) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      ...metadata,
      environment: process.env.NODE_ENV || 'development'
    };

    // In development, pretty print
    if (isDevelopment) {
      console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
        `[${logEntry.level}]`,
        logEntry.timestamp,
        logEntry.message,
        Object.keys(metadata).length > 0 ? metadata : ''
      );
    } else {
      // In production, output JSON for CloudWatch
      console.log(JSON.stringify(logEntry));
    }
  };

  return {
    info: (message, metadata) => logStructured('info', message, metadata),
    error: (message, metadata) => logStructured('error', message, metadata),
    warn: (message, metadata) => logStructured('warn', message, metadata),
    debug: (message, metadata) => {
      if (isDevelopment) {
        logStructured('debug', message, metadata);
      }
    },
    // Metrics logging for CloudWatch
    metric: (metricName, value, unit = 'Count', dimensions = {}) => {
      const metricEntry = {
        timestamp: new Date().toISOString(),
        type: 'METRIC',
        metricName,
        value,
        unit,
        dimensions,
        environment: process.env.NODE_ENV || 'development'
      };
      
      if (isDevelopment) {
        console.log('[METRIC]', metricName, '=', value, unit, dimensions);
      } else {
        console.log(JSON.stringify(metricEntry));
      }
    }
  };
}
