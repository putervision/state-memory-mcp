import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { registerProject, getRegistry, unregisterProject } from '../../src/engine/db.js';
import { runInitGlobal } from '../../src/cli/init.js';

describe('Global Init & Index Tracker CLI Tests', () => {
  const tmpDir = path.join(
    os.tmpdir(),
    `global-init-test-${Math.random().toString(36).substring(2)}`
  );
  const project1Path = path.join(tmpDir, 'project1');
  const project2Path = path.join(tmpDir, 'project2');

  beforeEach(() => {
    fs.mkdirSync(project1Path, { recursive: true });
    fs.mkdirSync(project2Path, { recursive: true });
    registerProject('proj1-test', project1Path);
    registerProject('proj2-test', project2Path);
  });

  afterEach(() => {
    unregisterProject('proj1-test');
    unregisterProject('proj2-test');
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should register and retrieve projects from the global index', () => {
    const registry = getRegistry();
    expect(registry['proj1-test']).toBe(path.resolve(project1Path));
    expect(registry['proj2-test']).toBe(path.resolve(project2Path));
  });

  it('should run init-global across all registered projects cleanly', async () => {
    await runInitGlobal();

    // Verify .state-memory-mcp directory and scaffolded rules exist in both projects
    expect(fs.existsSync(path.join(project1Path, '.state-memory-mcp'))).toBe(true);
    expect(fs.existsSync(path.join(project2Path, '.state-memory-mcp'))).toBe(true);
    expect(fs.existsSync(path.join(project1Path, '.agents', 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(project2Path, '.agents', 'AGENTS.md'))).toBe(true);
  });

  it('should clean stale project registrations when --clean-stale flag is passed', async () => {
    const stalePath = path.join(tmpDir, 'stale_project');
    registerProject('stale-test', stalePath);

    expect(getRegistry()['stale-test']).toBeDefined();

    await runInitGlobal({ cleanStale: true });

    expect(getRegistry()['stale-test']).toBeUndefined();
  });
});
