import { describe, it, expect } from 'vitest';
import { z } from '../../src/schema/schemas.js';

describe('Schema Builders Deep Branch Coverage Suite', () => {
  it('should test StringSchema all branches', () => {
    const s = z.string().describe('test str').min(2, 'Too short').max(5, 'Too long');
    expect(s.toJsonSchema().description).toBe('test str');

    // Valid
    expect(s.parse('abc')).toBe('abc');

    // Control characters error
    expect(() => s.parse('ab\x00c')).toThrow('contains forbidden control characters');

    // Min error
    expect(() => s.parse('a')).toThrow('Too short');

    // Max error
    expect(() => s.parse('abcdef')).toThrow('Too long');

    // Non-string error
    expect(() => s.parse(123)).toThrow('must be a string');

    // Default vs optional
    const withDef = z.string().default('fallback');
    expect(withDef.parse(undefined)).toBe('fallback');
    expect(withDef.toJsonSchema().default).toBe('fallback');

    const opt = z.string().optional();
    expect(opt.parse(undefined)).toBeUndefined();
    expect(() => z.string().parse(undefined)).toThrow('is required');
  });

  it('should test NumberSchema all branches', () => {
    const n = z.number().describe('test num').min(10).max(20);
    expect(n.toJsonSchema().description).toBe('test num');

    // Valid
    expect(n.parse(15)).toBe(15);

    // Min & Max errors
    expect(() => n.parse(5)).toThrow();
    expect(() => n.parse(25)).toThrow();

    // Non-number error
    expect(() => n.parse('not_a_num')).toThrow('must be a number');

    // Default vs optional vs required
    const withDef = z.number().default(42);
    expect(withDef.parse(undefined)).toBe(42);

    const opt = z.number().optional();
    expect(opt.parse(undefined)).toBeUndefined();
    expect(() => z.number().parse(undefined)).toThrow('is required');
  });

  it('should test BooleanSchema all branches', () => {
    const b = z.boolean().describe('test bool');
    expect(b.toJsonSchema().description).toBe('test bool');

    expect(b.parse(true)).toBe(true);
    expect(b.parse(false)).toBe(false);
    expect(() => b.parse('true')).toThrow('must be a boolean');

    const withDef = z.boolean().default(true);
    expect(withDef.parse(undefined)).toBe(true);

    const opt = z.boolean().optional();
    expect(opt.parse(undefined)).toBeUndefined();
    expect(() => z.boolean().parse(undefined)).toThrow('is required');
  });

  it('should test ArraySchema all branches', () => {
    const arr = z.array(z.string()).describe('test arr');
    expect(arr.toJsonSchema().description).toBe('test arr');

    expect(arr.parse(['a', 'b'])).toEqual(['a', 'b']);
    expect(() => arr.parse('not_an_array')).toThrow('must be an array');
    expect(() => arr.parse([123])).toThrow('must be a string');

    const withDef = z.array(z.string()).default(['def']);
    expect(withDef.parse(undefined)).toEqual(['def']);

    const opt = z.array(z.string()).optional();
    expect(opt.parse(undefined)).toBeUndefined();
    expect(() => z.array(z.string()).parse(undefined)).toThrow('is required');
  });

  it('should test ObjectSchema, EnumSchema, and RecordSchema branches', () => {
    // ObjectSchema
    const obj = z
      .object({
        name: z.string(),
        age: z.number().optional(),
      })
      .describe('test obj');
    expect(obj.toJsonSchema().description).toBe('test obj');

    expect(obj.parse({ name: 'Alice' })).toEqual({ name: 'Alice' });
    expect(() => obj.parse('not_an_obj')).toThrow('must be an object');
    expect(() => obj.parse(null)).toThrow();

    const withDef = (obj as any).default({ name: 'Default' });
    expect(withDef.parse(undefined)).toEqual({ name: 'Default' });

    const opt = obj.optional();
    expect(opt.parse(undefined)).toBeUndefined();

    // EnumSchema
    const en = z.enum(['A', 'B']).describe('test enum');
    expect(en.toJsonSchema().description).toBe('test enum');
    expect(en.parse('A')).toBe('A');
    expect(() => en.parse('C')).toThrow('must be one of: A, B');

    // RecordSchema & refine
    const rec = z
      .record(z.unknown())
      .refine((val) => Object.keys(val).length < 5, { message: 'Too many keys' });
    expect(rec.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(() => rec.parse('not_rec')).toThrow('must be an object');
    expect(() => rec.parse({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 })).toThrow('Too many keys');

    const res = rec.safeParse({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 });
    expect(res.success).toBe(false);
    expect(res.error?.format()).toBe('Too many keys');
  });
});
