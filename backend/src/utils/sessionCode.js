/**
 * Session code generation utilities
 * Generates 6-character alphanumeric session codes
 */

/**
 * Generate a random 6-character alphanumeric session code
 * Format: [A-Z0-9]{6} (e.g., AB12CD, X7K9M2)
 * 
 * @returns {string} 6-character session code
 */
export function generateSessionCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return code;
}

/**
 * Validate session code format
 * @param {string} code - Session code to validate
 * @returns {boolean} True if valid format
 */
export function validateSessionCode(code) {
  if (!code || typeof code !== 'string') {
    return false;
  }
  
  // Must be exactly 6 alphanumeric characters
  return /^[A-Z0-9]{6}$/.test(code);
}

