/**
 * Utility functions for safe JSON parsing and schema validation.
 */

/**
 * Safely parses a JSON string, returning a fallback value if parsing fails.
 *
 * @param jsonString - The JSON string to parse.
 * @param fallback - Optional fallback value if JSON is null, invalid, or malformed.
 * @returns The parsed object or fallback value.
 */
export function safeJsonParse<T = any>(jsonString: string | null | undefined, fallback: T): T {
  if (!jsonString) return fallback;
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
}

/**
 * Checks whether a string is valid JSON without throwing.
 *
 * @param str - The string to check.
 * @returns True if valid JSON, false otherwise.
 */
export function isValidJson(str: string): boolean {
  if (!str) return false;
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}
