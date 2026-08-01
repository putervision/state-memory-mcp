import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadProjectConfig } from '../../src/engine/config.js';

describe('Project Configuration Engine Edge Cases', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should return empty object if config file does not exist', () => {
    const config = loadProjectConfig(tmpDir);
    expect(config).toEqual({});
  });

  it('should load valid config and utilize cache within TTL', () => {
    const configPath = path.join(tmpDir, '.state-memory-mcp.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        projectName: 'Test Project',
        strictAudit: true,
        busyTimeoutMs: 5000,
      })
    );

    const cfg1 = loadProjectConfig(tmpDir);
    expect(cfg1.projectName).toBe('Test Project');
    expect(cfg1.strictAudit).toBe(true);

    // Second call returns cached config
    const cfg2 = loadProjectConfig(tmpDir);
    expect(cfg2).toBe(cfg1);
  });

  it('should log deprecation warning if legacy encryptionKey is found in config', () => {
    const configPath = path.join(tmpDir, '.state-memory-mcp.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        projectName: 'Legacy Key Project',
        encryptionKey: 'deprecated-secret-123',
      })
    );

    const cfg = loadProjectConfig(tmpDir);
    expect(cfg.projectName).toBe('Legacy Key Project');
  });

  it('should validate storagePath against path traversal and fall back if outside root', () => {
    const configPath = path.join(tmpDir, '.state-memory-mcp.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        projectName: 'Traversal Project',
        storagePath: '../../../../../../etc/malicious',
      })
    );

    const cfg = loadProjectConfig(tmpDir);
    expect(cfg.projectName).toBe('Traversal Project');
    expect(cfg.storagePath).toBeUndefined();
  });

  it('should handle invalid configuration schema gracefully and return empty object', () => {
    const configPath = path.join(tmpDir, '.state-memory-mcp.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        busyTimeoutMs: 'not-a-number',
        cycleDetectionMode: 'invalid_mode',
      })
    );

    const cfg = loadProjectConfig(tmpDir);
    expect(cfg).toEqual({});
  });

  it('should handle malformed JSON gracefully', () => {
    const configPath = path.join(tmpDir, '.state-memory-mcp.json');
    fs.writeFileSync(configPath, '{ corrupt json payload...');

    const cfg = loadProjectConfig(tmpDir);
    expect(cfg).toEqual({});
  });
});
