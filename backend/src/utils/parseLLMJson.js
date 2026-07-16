/**
 * Parse a JSON payload from an LLM response, stripping markdown code fences
 * (```json ... ``` or bare ``` ... ```) if present.
 * @param {string} text - Raw LLM response content
 * @returns {*} Parsed JSON value
 * @throws {SyntaxError} If the cleaned content is not valid JSON
 */
export function parseLLMJson(text) {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned);
}
