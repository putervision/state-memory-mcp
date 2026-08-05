import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { describe, it, expect, afterAll } from 'vitest';
import { subprojectsAction } from '../../src/cli/commands/subprojects.js';
import { closeAllDbs } from '../../src/engine/db.js';

describe('CLI subprojectsAction Command', () => {
  const project = 'subprojects-cli-test-project';
  const tmpDir = path.join(os.tmpdir(), `subproject-test-${Date.now()}`);

  afterAll(() => {
    closeAllDbs();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should run subprojectsAction without throwing errors', async () => {
    await expect(subprojectsAction({ project })).resolves.not.toThrow();
  });

  it('should detect nested sub-directory memory databases in target root', async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const subDbDir = path.join(tmpDir, 'sub-app', '.state-memory-mcp', 'sub-app-slug');
    fs.mkdirSync(subDbDir, { recursive: true });
    const dbPath = path.join(subDbDir, 'graph.db');
    const conn = new Database(dbPath);
    conn.exec('CREATE TABLE nodes (id TEXT PRIMARY KEY, type TEXT);');
    conn.exec("INSERT INTO nodes (id, type) VALUES ('n1', 'task');");
    conn.close();

    await expect(subprojectsAction({ project: tmpDir })).resolves.not.toThrow();
  });
});
