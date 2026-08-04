import { describe, it, expect, afterAll } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import {
  resolveProjectRoot,
  closeAllDbs,
  encryptPayload,
  decryptPayload,
  checkDatabaseSizeLimit,
  getDb,
  getMetaValue,
  setMetaValue,
} from '../../src/engine/db.js';

describe('Database Engine Extended Coverage', () => {
  const project = 'db-extended-cov-project';

  afterAll(() => {
    closeAllDbs();
  });

  it('should resolve project root tree walking fallback when no .git or state-memory exists', () => {
    const resolved = resolveProjectRoot(undefined, os.tmpdir());
    expect(resolved).toBeDefined();
    expect(typeof resolved).toBe('string');
  });

  it('should encrypt and decrypt payloads with STATE_MEMORY_ENCRYPTION_KEY', () => {
    const originalEnv = process.env.STATE_MEMORY_ENCRYPTION_KEY;
    process.env.STATE_MEMORY_ENCRYPTION_KEY = 'secret-encryption-key-for-test-32b';

    const plain = '{"secret":"data"}';
    const encrypted = encryptPayload(plain);
    expect(encrypted.startsWith('ENC:')).toBe(true);

    const decrypted = decryptPayload(encrypted);
    expect(decrypted).toBe(plain);

    // Test decrypting invalid enc string fallback
    expect(decryptPayload('ENC:invalid:parts')).toBe('ENC:invalid:parts');

    process.env.STATE_MEMORY_ENCRYPTION_KEY = originalEnv;
  });

  it('should check database size limits and set/get meta values', () => {
    const db = getDb(project);
    setMetaValue(db, 'custom_key', 'custom_value');
    expect(getMetaValue(db, 'custom_key')).toBe('custom_value');

    const projectRoot = resolveProjectRoot(project);
    expect(() => checkDatabaseSizeLimit(db, projectRoot)).not.toThrow();
  });
});
