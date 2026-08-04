import { describe, it, expect } from 'vitest';
import { safeJsonParse, isValidJson } from '../../src/utils/json-validator.js';

describe('JSON Validator Utilities', () => {
  it('should parse valid JSON strings', () => {
    expect(safeJsonParse('{"key":"value"}', {})).toEqual({ key: 'value' });
  });

  it('should return fallback for null, undefined, or malformed JSON strings', () => {
    expect(safeJsonParse(null, { default: true })).toEqual({ default: true });
    expect(safeJsonParse(undefined, { default: true })).toEqual({ default: true });
    expect(safeJsonParse('{invalid-json', { default: true })).toEqual({ default: true });
  });

  it('should validate JSON strings with isValidJson', () => {
    expect(isValidJson('{"a":1}')).toBe(true);
    expect(isValidJson('')).toBe(false);
    expect(isValidJson('invalid')).toBe(false);
  });
});
