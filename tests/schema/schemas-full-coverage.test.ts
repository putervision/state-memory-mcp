import { describe, it, expect } from 'vitest';
import {
  z,
  StringSchema,
  NumberSchema,
  BooleanSchema,
  ArraySchema,
  EnumSchema,
  ObjectSchema,
  RecordSchema,
  ImportIssuesSchema,
  VCSMergeResolutionSchema,
} from '../../src/schema/schemas.js';

describe('Schema Builders & Validation Coverage', () => {
  it('should validate StringSchema min, max, control characters, and toJsonSchema', () => {
    const strSc = z.string().min(3).max(10).describe('Test string');
    expect(strSc.description).toBe('Test string');
    expect(strSc.parse('hello')).toBe('hello');

    expect(() => strSc.parse('hi')).toThrow();
    expect(() => strSc.parse('way-too-long-string')).toThrow();
    expect(() => strSc.parse('control\x05char')).toThrow();

    const jsonSc = strSc.toJsonSchema();
    expect(jsonSc.type).toBe('string');
  });

  it('should validate NumberSchema min, max, and optional defaults', () => {
    const numSc = z.number().min(0).max(100).optional().default(50);
    expect(numSc.parse(undefined)).toBe(50);
    expect(numSc.parse(10)).toBe(10);

    expect(() => numSc.parse(-5)).toThrow();
    expect(() => numSc.parse(150)).toThrow();
    expect(() => numSc.parse('not-a-number')).toThrow();
  });

  it('should validate BooleanSchema, ArraySchema, EnumSchema, ObjectSchema, RecordSchema, UnionSchema', () => {
    const boolSc = z.boolean().describe('Flag');
    expect(boolSc.parse(true)).toBe(true);

    const arrSc = z.array(z.string()).min(1);
    expect(arrSc.parse(['a', 'b'])).toEqual(['a', 'b']);
    expect(() => arrSc.parse([])).toThrow();

    const enumSc = z.enum(['A', 'B']);
    expect(enumSc.parse('A')).toBe('A');
    expect(() => enumSc.parse('C')).toThrow();

    const objSc = z.object({
      field: z.string(),
    });
    expect(objSc.parse({ field: 'val' })).toEqual({ field: 'val' });
    expect(() => objSc.parse('not-object')).toThrow();

    const recSc = z.record(z.number());
    expect(recSc.parse({ x: 10 })).toEqual({ x: 10 });
    expect(() => recSc.parse({ x: 'str' })).toThrow();
  });

  it('should parse ImportIssuesSchema and VCSMergeResolutionSchema', () => {
    const validImport = ImportIssuesSchema.parse({
      issues: [{ external_id: 'EXT-1', title: 'Issue Title' }],
    });
    expect(validImport.issues).toHaveLength(1);

    const validMerge = VCSMergeResolutionSchema.parse({
      source_branch: 'feature',
      target_branch: 'main',
      strategy: 'auto_accept',
    });
    expect(validMerge.strategy).toBe('auto_accept');
  });
});
