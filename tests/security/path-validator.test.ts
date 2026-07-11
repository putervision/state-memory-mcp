import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { validatePath, loadPathConfig } from '../../src/utils/path-validator.js';
import { ValidationError } from '../../src/utils/errors.js';

describe('Security - Path Validator & Command Injection', () => {
  describe('validatePath', () => {
    const projectRoot = path.resolve('.');
    const pathConfig = loadPathConfig(projectRoot);

    it('should allow paths within the project root', () => {
      const safePath = path.join(projectRoot, 'src', 'utils', 'path-validator.ts');
      expect(() => validatePath(safePath, pathConfig)).not.toThrow();
    });

    it('should allow paths within the backups directory', () => {
      const backupDir =
        pathConfig.allowedDirs[1] || path.join(os.homedir(), '.state-memory-mcp', 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const safeBackupPath = path.join(backupDir, 'test-backup.db');
      expect(() => validatePath(safeBackupPath, pathConfig)).not.toThrow();
    });

    it('should reject paths resolving outside allowed directories (traversal)', () => {
      const traversalPath = path.join(projectRoot, '..', '..', 'etc', 'passwd');
      expect(() => validatePath(traversalPath, pathConfig)).toThrow(ValidationError);
    });

    it('should reject path segment manipulation trying to bypass base validation', () => {
      const maliciousPath = projectRoot + '/../passwd';
      expect(() => validatePath(maliciousPath, pathConfig)).toThrow(ValidationError);
    });
  });
});
