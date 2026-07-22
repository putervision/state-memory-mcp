import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getDb, closeAllDbs } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { backupProjectDb, restoreProjectDb } from '../../src/engine/backup.js';

describe('Backup & Restore Engine', () => {
  const project = 'backup-test-project';
  const backupPath = path.join(process.cwd(), '.state-memory-mcp', 'test-backup.db');

  beforeAll(() => {
    closeAllDbs();
    const db = getDb(project);
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Node to backup',
      status: 'pending',
    });
  });

  afterAll(() => {
    closeAllDbs();
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
  });

  it('should backup project database to file with SHA256 checksum', async () => {
    const backupFile = await backupProjectDb({ project, outputPath: backupPath });
    expect(backupFile).toBe(backupPath);
    expect(fs.existsSync(backupPath)).toBe(true);
    expect(fs.existsSync(`${backupPath}.sha256`)).toBe(true);
  });

  it('should restore project database from backup file', () => {
    restoreProjectDb({ project, backupPath });

    const db = getDb(project);
    const node = db.prepare('SELECT title FROM nodes WHERE project = ?').get(project) as any;
    expect(node).toBeDefined();
    expect(node.title).toBe('Node to backup');
  });
});
