import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runInit } from '../../src/cli/init.js';
import { closeAllDbs } from '../../src/engine/db.js';

describe('CLI Init Extended Flags & Scaffolding', () => {
  const tmpDir = path.join(os.tmpdir(), `init-flags-test-${Date.now()}`);

  afterAll(() => {
    closeAllDbs();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should runInit in a non-git directory with custom flags', async () => {
    fs.mkdirSync(tmpDir, { recursive: true });

    // Pre-create .gitignore to test existing file update branch
    const gitignorePath = path.join(tmpDir, '.gitignore');
    fs.writeFileSync(gitignorePath, 'node_modules\n');

    await runInit(tmpDir, {
      fromGit: false,
      createTasks: false,
      createArtifacts: false,
    });

    expect(fs.existsSync(path.join(tmpDir, '.state-memory-mcp'))).toBe(true);
    expect(fs.readFileSync(gitignorePath, 'utf-8')).toContain('.state-memory-mcp');
    expect(fs.existsSync(path.join(tmpDir, '.agents'))).toBe(true);
  });
});
