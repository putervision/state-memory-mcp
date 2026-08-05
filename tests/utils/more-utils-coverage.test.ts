import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { logger } from '../../src/utils/logger.js';
import { loadPathConfig, validatePath } from '../../src/utils/path-validator.js';
import { redactData } from '../../src/utils/redact.js';

describe('More Utils Coverage Test Suite', () => {
  it('should test logger methods without erroring', () => {
    expect(() => {
      logger.debug('Debug log test message');
      logger.info('Info log test message');
      logger.warn('Warn log test message');
      logger.error('Error log test message');
    }).not.toThrow();
  });

  it('should test loadPathConfig with .state-memory-mcp.json allowedExportDirs', () => {
    const tmpDir = path.join(os.tmpdir(), `path-cfg-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const cfgPath = path.join(tmpDir, '.state-memory-mcp.json');
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({ allowedExportDirs: ['/tmp/custom-allowed-dir'] }),
      'utf-8'
    );

    const config = loadPathConfig(tmpDir);
    expect(config.allowedDirs).toContain(path.resolve('/tmp/custom-allowed-dir'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should test validatePath error conditions for mustExist and allowCreate', () => {
    const root = process.cwd();
    const config = { allowedDirs: [root], mustExist: true };
    const nonExistentPath = path.join(root, 'non-existent-file-12345.txt');

    expect(() => validatePath(nonExistentPath, config)).toThrow('Target path does not exist');

    const configNoCreate = { allowedDirs: [root], allowCreate: false };
    expect(() => validatePath(nonExistentPath, configNoCreate)).toThrow(
      'Creating new files is not allowed'
    );
  });

  it('should test redactData handling nulls, primitives, and nested objects', () => {
    expect(redactData(null)).toBeNull();
    expect(redactData('simple string')).toBe('simple string');
    expect(redactData(12345)).toBe(12345);

    const nested = {
      meta: {
        token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret',
      },
    };
    const redacted = redactData(nested);
    expect(redacted.meta.token).toContain('[REDACTED]');
  });
});
