import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { closeAllDbs, getDb, getDbPath, closeDb } from '../../src/engine/db.js';
import { backupProjectDb, restoreProjectDb } from '../../src/engine/backup.js';
import { auditProjectDb } from '../../src/engine/audit.js';
import { mergeProjectDb } from '../../src/engine/merge.js';

describe('Database Operations (Backup, Restore, Audit, Merge)', () => {
  const targetProject = 'test-db-ops-target';
  const sourceProject = 'test-db-ops-source';

  beforeEach(() => {
    // Clean target database
    const dbTarget = getDb(targetProject);
    dbTarget.prepare('DELETE FROM edges').run();
    dbTarget.prepare('DELETE FROM nodes').run();

    // Clean source database
    const dbSource = getDb(sourceProject);
    dbSource.prepare('DELETE FROM edges').run();
    dbSource.prepare('DELETE FROM nodes').run();
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should backup and restore a database successfully', async () => {
    // 1. Setup target DB with some data
    const nodeA = GraphEngine.addNode({
      project: targetProject,
      type: 'task',
      title: 'Node A',
      status: 'pending',
    });

    const nodeB = GraphEngine.addNode({
      project: targetProject,
      type: 'task',
      title: 'Node B',
      status: 'pending',
    });

    EdgeEngine.addEdge({
      project: targetProject,
      source_id: nodeA.id,
      target_id: nodeB.id,
      type: 'depends_on',
    });

    // 2. Perform backup
    const backupPath = await backupProjectDb({ project: targetProject });
    expect(fs.existsSync(backupPath)).toBe(true);

    // Verify backup DB contents directly
    const backupDb = new Database(backupPath, { readonly: true });
    const nodesCount = backupDb.prepare('SELECT COUNT(*) as count FROM nodes').get() as {
      count: number;
    };
    const edgesCount = backupDb.prepare('SELECT COUNT(*) as count FROM edges').get() as {
      count: number;
    };
    backupDb.close();

    expect(nodesCount.count).toBe(2);
    expect(edgesCount.count).toBe(1);

    // 3. Mutate the target DB
    GraphEngine.addNode({
      project: targetProject,
      type: 'task',
      title: 'Node C',
      status: 'pending',
    });

    // Verify target DB has 3 nodes now
    const targetDbBeforeRestore = getDb(targetProject);
    expect(
      (targetDbBeforeRestore.prepare('SELECT COUNT(*) as count FROM nodes').get() as any).count
    ).toBe(3);

    // 4. Restore target DB from backup
    restoreProjectDb({ project: targetProject, backupPath });

    // Verify target DB is back to 2 nodes
    const targetDbAfterRestore = getDb(targetProject);
    expect(
      (targetDbAfterRestore.prepare('SELECT COUNT(*) as count FROM nodes').get() as any).count
    ).toBe(2);

    // Cleanup backup file
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
  });

  it('should audit database and detect integrity, cycles, and contradictions', () => {
    // 1. Audit clean DB
    const reportClean = auditProjectDb({ project: targetProject });
    expect(reportClean.sqlite_integrity).toContain('ok');
    expect(reportClean.cycles.length).toBe(0);
    expect(reportClean.contradictions.blocked_done_tasks.length).toBe(0);

    // 2. Introduce cycle: Node A blocks Node B, Node B blocks Node A
    const nodeA = GraphEngine.addNode({
      project: targetProject,
      type: 'task',
      title: 'Node A',
      status: 'pending',
    });

    const nodeB = GraphEngine.addNode({
      project: targetProject,
      type: 'task',
      title: 'Node B',
      status: 'pending',
    });

    // Directly insert the cycle bypass graph validation
    const db = getDb(targetProject);
    db.prepare(
      `
      INSERT INTO edges (id, source_id, target_id, type, project, git_branch, created_at)
      VALUES ('edge-1', ?, ?, 'blocks', ?, 'main', '2026-07-08T10:00:00Z')
    `
    ).run(nodeA.id, nodeB.id, targetProject);

    db.prepare(
      `
      INSERT INTO edges (id, source_id, target_id, type, project, git_branch, created_at)
      VALUES ('edge-2', ?, ?, 'blocks', ?, 'main', '2026-07-08T10:00:00Z')
    `
    ).run(nodeB.id, nodeA.id, targetProject);

    // Audit and verify cycle detected
    const reportCycle = auditProjectDb({ project: targetProject });
    expect(reportCycle.cycles.length).toBeGreaterThan(0);

    // 3. Introduce contradiction: Task C is done, but blocks by active blocker D
    const nodeC = GraphEngine.addNode({
      project: targetProject,
      type: 'task',
      title: 'Task C',
      status: 'done',
    });

    const nodeD = GraphEngine.addNode({
      project: targetProject,
      type: 'blocker',
      title: 'Blocker D',
      status: 'active',
    });

    db.prepare(
      `
      INSERT INTO edges (id, source_id, target_id, type, project, git_branch, created_at)
      VALUES ('edge-3', ?, ?, 'blocks', ?, 'main', '2026-07-08T10:00:00Z')
    `
    ).run(nodeD.id, nodeC.id, targetProject);

    // Audit and verify contradiction detected
    const reportContradiction = auditProjectDb({ project: targetProject });
    expect(reportContradiction.contradictions.blocked_done_tasks.length).toBe(1);
    expect(reportContradiction.contradictions.blocked_done_tasks[0].task.id).toBe(nodeC.id);
    expect(reportContradiction.contradictions.blocked_done_tasks[0].blocker.id).toBe(nodeD.id);
  });

  it('should merge databases resolving conflicts by newer updated_at', () => {
    // 1. Target database setup
    const nodeA = GraphEngine.addNode({
      project: targetProject,
      type: 'task',
      title: 'Old Title A',
      status: 'pending',
    });
    // Set target node updated_at back in time
    const dbTarget = getDb(targetProject);
    dbTarget
      .prepare("UPDATE nodes SET updated_at = '2026-07-08T10:00:00Z' WHERE id = ?")
      .run(nodeA.id);

    // 2. Source database setup
    // Node A exists in source with newer timestamp and new title
    const dbSource = getDb(sourceProject);
    dbSource
      .prepare(
        `
      INSERT INTO nodes (id, type, title, status, project, git_branch, metadata, tags, created_at, updated_at)
      VALUES (?, 'task', 'New Title A', 'pending', ?, 'main', '{}', '[]', '2026-07-08T10:00:00Z', '2026-07-08T12:00:00Z')
    `
      )
      .run(nodeA.id, sourceProject);

    // Node B is a new node in source
    const nodeBId = 'new-node-b';
    dbSource
      .prepare(
        `
      INSERT INTO nodes (id, type, title, status, project, git_branch, metadata, tags, created_at, updated_at)
      VALUES (?, 'task', 'Node B', 'pending', ?, 'main', '{}', '[]', '2026-07-08T10:00:00Z', '2026-07-08T10:00:00Z')
    `
      )
      .run(nodeBId, sourceProject);

    // Close source DB connection to release lock so it can be merged
    closeDb(sourceProject);
    const sourceDbPath = getDbPath(sourceProject);

    // 3. Perform Merge
    const report = mergeProjectDb({
      project: targetProject,
      sourcePath: sourceDbPath,
    });

    expect(report.nodes_added).toBe(1); // Node B
    expect(report.nodes_updated).toBe(1); // Node A updated
    expect(report.nodes_skipped).toBe(0);

    // 4. Verify target DB has correct titles and merged nodes
    const targetDb = getDb(targetProject);
    const mergedNodeA = targetDb
      .prepare('SELECT title, updated_at FROM nodes WHERE id = ?')
      .get(nodeA.id) as any;
    expect(mergedNodeA.title).toBe('New Title A');
    expect(mergedNodeA.updated_at).toBe('2026-07-08T12:00:00Z');

    const mergedNodeB = targetDb
      .prepare('SELECT title FROM nodes WHERE id = ?')
      .get(nodeBId) as any;
    expect(mergedNodeB.title).toBe('Node B');
  });

  it('should rollback merge transaction if cycle is introduced without force flag', () => {
    // 1. Target database setup: Node A blocks Node B
    const nodeA = GraphEngine.addNode({
      project: targetProject,
      type: 'task',
      title: 'Node A',
      status: 'pending',
    });
    const nodeB = GraphEngine.addNode({
      project: targetProject,
      type: 'task',
      title: 'Node B',
      status: 'pending',
    });
    EdgeEngine.addEdge({
      project: targetProject,
      source_id: nodeA.id,
      target_id: nodeB.id,
      type: 'blocks',
    });

    // 2. Source database setup: Node B blocks Node A (creating a cycle)
    const dbSource = getDb(sourceProject);
    dbSource
      .prepare(
        `
      INSERT INTO nodes (id, type, title, status, project, git_branch, metadata, tags, created_at, updated_at)
      VALUES (?, 'task', 'Node A', 'pending', ?, 'main', '{}', '[]', '2026-07-08T10:00:00Z', '2026-07-08T10:00:00Z')
    `
      )
      .run(nodeA.id, sourceProject);

    dbSource
      .prepare(
        `
      INSERT INTO nodes (id, type, title, status, project, git_branch, metadata, tags, created_at, updated_at)
      VALUES (?, 'task', 'Node B', 'pending', ?, 'main', '{}', '[]', '2026-07-08T10:00:00Z', '2026-07-08T10:00:00Z')
    `
      )
      .run(nodeB.id, sourceProject);

    dbSource
      .prepare(
        `
      INSERT INTO edges (id, source_id, target_id, type, project, git_branch, created_at)
      VALUES ('edge-cycle-source', ?, ?, 'blocks', ?, 'main', '2026-07-08T10:00:00Z')
    `
      )
      .run(nodeB.id, nodeA.id, sourceProject);

    closeDb(sourceProject);
    const sourceDbPath = getDbPath(sourceProject);

    // 3. Perform Merge (should throw and rollback)
    expect(() => {
      mergeProjectDb({
        project: targetProject,
        sourcePath: sourceDbPath,
        force: false,
      });
    }).toThrow('Merge introduces circular dependencies.');

    // 4. Verify target DB remained untouched (no edge B -> A)
    const targetDb = getDb(targetProject);
    const cycleEdge = targetDb.prepare('SELECT 1 FROM edges WHERE id = ?').get('edge-cycle-source');
    expect(cycleEdge).toBeUndefined();

    // 5. Perform Merge with force: true (should succeed)
    const reportForce = mergeProjectDb({
      project: targetProject,
      sourcePath: sourceDbPath,
      force: true,
    });

    expect(reportForce.cycles_detected.length).toBe(1);
    expect(reportForce.transaction_rolled_back).toBe(false);

    // Verify target DB has the cycle edge now
    const cycleEdgeForce = targetDb
      .prepare('SELECT 1 FROM edges WHERE id = ?')
      .get('edge-cycle-source');
    expect(cycleEdgeForce).toBeDefined();
  });
});
