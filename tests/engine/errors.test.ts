import { describe, it, expect } from 'vitest';
import { StateMemoryError, DatabaseError, ValidationError } from '../../src/utils/errors.js';

describe('Structured Error Hierarchy Tests', () => {
  it('should instantiate error subclasses with correct codes and prototypes', () => {
    const dbErr = new DatabaseError('db failed');
    expect(dbErr).toBeInstanceOf(Error);
    expect(dbErr).toBeInstanceOf(StateMemoryError);
    expect(dbErr).toBeInstanceOf(DatabaseError);
    expect(dbErr.code).toBe('DATABASE_ERROR');
    expect(dbErr.message).toBe('db failed');

    const valErr = new ValidationError('validation failed');
    expect(valErr).toBeInstanceOf(ValidationError);
    expect(valErr.code).toBe('VALIDATION_ERROR');
  });
});
