import { describe, it, expect } from 'vitest';
import { StateGraphError, DatabaseError, ValidationError, GitScannerError, McpServerError } from '../../src/utils/errors.js';

describe('Structured Error Hierarchy Tests', () => {
  it('should instantiate error subclasses with correct codes and prototypes', () => {
    const dbErr = new DatabaseError('db failed');
    expect(dbErr).toBeInstanceOf(Error);
    expect(dbErr).toBeInstanceOf(StateGraphError);
    expect(dbErr).toBeInstanceOf(DatabaseError);
    expect(dbErr.code).toBe('DATABASE_ERROR');
    expect(dbErr.message).toBe('db failed');

    const valErr = new ValidationError('validation failed');
    expect(valErr).toBeInstanceOf(ValidationError);
    expect(valErr.code).toBe('VALIDATION_ERROR');

    const gitErr = new GitScannerError('git scanner failed');
    expect(gitErr).toBeInstanceOf(GitScannerError);
    expect(gitErr.code).toBe('GIT_SCANNER_ERROR');

    const mcpErr = new McpServerError('mcp failed');
    expect(mcpErr).toBeInstanceOf(McpServerError);
    expect(mcpErr.code).toBe('MCP_SERVER_ERROR');
  });
});
