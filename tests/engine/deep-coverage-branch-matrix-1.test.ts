import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getDb, closeDb, closeAllDbs } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { auditProjectDb } from '../../src/engine/audit.js';
import { QueryEngine } from '../../src/engine/queries.js';
import { backupProjectDb, restoreProjectDb } from '../../src/engine/backup.js';
import { ValidationError } from '../../src/utils/errors.js';

describe('Deep Coverage Branch Matrix 1 - Audit, Queries, DB, Backup', () => {
  let project: string;
  const testBackupsDir = path.resolve(process.cwd(), '.test-matrix-1-tmp');

  beforeEach(() => {
    project = `deep-matrix-1-${randomUUID()}`;
    closeAllDbs();
    if (fs.existsSync(testBackupsDir)) {
      try {
        fs.rmSync(testBackupsDir, { recursive: true, force: true });
      } catch {}
    }
    fs.mkdirSync(testBackupsDir, { recursive: true });
  });

  afterEach(() => {
    closeAllDbs();
    if (fs.existsSync(testBackupsDir)) {
      try {
        fs.rmSync(testBackupsDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('should cover auditProjectDb with orphaned edges, circular dependencies, and contradictions', async () => {
    const db = getDb(project);
    const n1 = GraphEngine.addNode({ project, type: 'task', title: 'Task 1', status: 'done' });
    const n2 = GraphEngine.addNode({ project, type: 'task', title: 'Task 2', status: 'pending' });
    const b1 = GraphEngine.addNode({
      project,
      type: 'blocker',
      title: 'Active Blocker',
      status: 'active',
    });

    // Logical contradiction: blocker blocks done task
    EdgeEngine.addEdge({ project, source_id: b1.id, target_id: n1.id, type: 'blocks' });

    // Insert cycle & orphaned edges directly with foreign_keys = OFF
    db.pragma('foreign_keys = OFF');
    db.prepare(
      "INSERT INTO edges (id, source_id, target_id, type, project, created_at) VALUES (?, ?, ?, 'depends_on', ?, datetime('now'))"
    ).run(randomUUID(), n1.id, n2.id, project);
    db.prepare(
      "INSERT INTO edges (id, source_id, target_id, type, project, created_at) VALUES (?, ?, ?, 'depends_on', ?, datetime('now'))"
    ).run(randomUUID(), n2.id, n1.id, project);
    db.prepare(
      "INSERT INTO edges (id, source_id, target_id, type, project, created_at) VALUES (?, 'non_1', 'non_2', 'depends_on', ?, datetime('now'))"
    ).run(randomUUID(), project);
    db.pragma('foreign_keys = ON');

    const report = await auditProjectDb({ project });
    expect(report.orphaned_edges_count).toBe(1);
    expect(report.cycles.length).toBeGreaterThan(0);
    expect(report.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it('should cover QueryEngine.searchNodes FTS fallback, sanitization, and sub-db queries', async () => {
    const db = getDb(project);
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'React Redux Migration Task',
      status: 'pending',
      tags: ['frontend', 'react'],
    });
    GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Use Redux Toolkit for state',
      status: 'accepted',
      tags: ['architecture'],
    });

    // Search with valid terms
    const res1 = await QueryEngine.searchNodes({
      project,
      query: 'React Redux',
      limit: 10,
      fields: ['id', 'title', 'type'],
    });
    expect(res1.nodes.length).toBeGreaterThan(0);
    expect(res1.nodes[0]).toHaveProperty('title');

    // Query with non-matching status filter
    const res2 = await QueryEngine.searchNodes({
      project,
      query: 'Migration',
      status: 'rejected',
    });
    expect(res2.nodes.length).toBe(0);

    // Search with algorithm: 'tfidf'
    const tfidfRes = await QueryEngine.searchNodes({
      project,
      query: 'React Redux Toolkit',
      algorithm: 'tfidf',
      limit: 5,
    });
    expect(tfidfRes.nodes.length).toBeGreaterThan(0);
  });

  it('should cover db close error handling branches', () => {
    const db = getDb(project);
    // Get a cached connection and mock its close method to throw
    const originalClose = db.close.bind(db);
    db.close = () => {
      throw new Error('Simulated DB Close Failure');
    };

    // Trigger closeDb and closeAllDbs error branches
    expect(() => closeDb(project)).not.toThrow();
    expect(() => closeAllDbs()).not.toThrow();

    // Restore
    db.close = originalClose;
    try {
      db.close();
    } catch {}
  });

  it('should cover backup and restore error branches', async () => {
    const db = getDb(project);
    GraphEngine.addNode({ project, type: 'task', title: 'Backup Task', status: 'pending' });

    // Backup
    const backupPath = await backupProjectDb({ project });
    expect(fs.existsSync(backupPath)).toBe(true);

    // Corrupted file restore
    const corruptFile = path.join(testBackupsDir, 'corrupt.db');
    fs.writeFileSync(corruptFile, 'not a valid sqlite database');
    expect(() => restoreProjectDb({ project, backupPath: corruptFile })).toThrow(ValidationError);

    // Missing tables file restore
    const emptyDbFile = path.join(testBackupsDir, 'empty.db');
    const emptyDb = new Database(emptyDbFile);
    emptyDb.prepare('CREATE TABLE dummy (id INTEGER)').run();
    emptyDb.close();
    expect(() => restoreProjectDb({ project, backupPath: emptyDbFile })).toThrow(ValidationError);

    // Checksum mismatch
    const badChecksumFile = path.join(testBackupsDir, 'valid_with_bad_checksum.db');
    fs.copyFileSync(backupPath, badChecksumFile);
    fs.writeFileSync(`${badChecksumFile}.sha256`, 'deadbeefbadchecksum1234567890');
    expect(() => restoreProjectDb({ project, backupPath: badChecksumFile })).toThrow(
      /checksum mismatch/i
    );

    // Valid restore
    expect(() => restoreProjectDb({ project, backupPath })).not.toThrow();
  });
});
