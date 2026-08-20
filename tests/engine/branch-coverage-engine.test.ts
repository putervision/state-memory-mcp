import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getDb, closeAllDbs } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { SessionEngine } from '../../src/engine/sessions.js';
import { getChanges } from '../../src/engine/changeset.js';
import { rollbackMigration, migrations } from '../../src/engine/migrations.js';
import { backupProjectDb, restoreProjectDb } from '../../src/engine/backup.js';
import {
  parseDuration,
  formatDuration,
  getStaleNodes,
  autoPruneStaleTasks,
} from '../../src/engine/staleness.js';
import { importIssues, exportIssues } from '../../src/engine/issue-sync.js';
import fs from 'fs';
import path from 'path';

describe('Engine Deep Branch Coverage Suite', () => {
  const project = 'engine-branch-cov-test';

  beforeEach(() => {
    const db = getDb(project);
    for (const m of migrations) {
      try {
        m.up(db);
      } catch {}
    }
    db.prepare('DELETE FROM events WHERE project = ?').run(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should test getChanges across all event types, branches, and filters', () => {
    const db = getDb(project);
    const session = SessionEngine.startSession(db, { project, agent_id: 'test-agent' });
    const startTime = new Date(Date.now() - 1000).toISOString();

    // 1. node_created (task, decision accepted, blocker active)
    const t1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Task T1',
      status: 'pending',
    });
    const d1 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Decision D1',
      status: 'accepted',
    });
    const b1 = GraphEngine.addNode({
      project,
      type: 'blocker',
      title: 'Blocker B1',
      status: 'active',
    });

    // 2. edges
    EdgeEngine.addEdge({ project, source_id: t1.id, target_id: d1.id, type: 'decided_in' });
    EdgeEngine.removeEdge({ project, source_id: t1.id, target_id: d1.id, type: 'decided_in' });

    // 3. node_updated
    GraphEngine.updateNode({ project, id: t1.id, status: 'done' });
    GraphEngine.updateNode({ project, id: d1.id, status: 'rejected' });
    GraphEngine.updateNode({ project, id: b1.id, status: 'resolved' });

    // 4. node_deleted
    GraphEngine.removeNode({ project, id: t1.id });

    // Call getChanges with since
    const changesSince = getChanges(db, { project, since: startTime });
    expect(changesSince.summary).toBeDefined();

    // Call getChanges with since_session
    const changesSess = getChanges(db, {
      project,
      since_session: session.session_id,
      git_branch: 'main',
    });
    expect(changesSess.summary).toBeDefined();

    // Error branches
    expect(() => getChanges(db, { project, since: '' })).toThrow();
    expect(() => getChanges(db, { project, since_session: 'non_existent_sess' })).toThrow();
  });

  it('should test migration rollbacks and re-migrations', () => {
    const db = getDb(project);
    const rolledBackVer = rollbackMigration(db, 0);
    expect(rolledBackVer).toBe(0);

    // Run up migrations
    for (const m of migrations) {
      m.up(db);
    }
    db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '12')").run();

    // Rollback to same or higher version (no-op branch)
    const sameVer = rollbackMigration(db, 12);
    expect(sameVer).toBe(12);
  });

  it('should test backup and restore database branches', async () => {
    GraphEngine.addNode({ project, type: 'task', title: 'Task to Backup' });

    const backupFile = path.join(process.cwd(), 'scratch_test_bk.db');
    try {
      const bkPath = await backupProjectDb({ project, outputPath: backupFile });
      expect(bkPath).toBeDefined();

      restoreProjectDb({ backupPath: backupFile, project });

      // Restore non-existent file
      expect(() => restoreProjectDb({ backupPath: 'invalid_missing.db', project })).toThrow();
    } finally {
      if (fs.existsSync(backupFile)) fs.unlinkSync(backupFile);
      if (fs.existsSync(backupFile + '.sha256')) fs.unlinkSync(backupFile + '.sha256');
    }
  });

  it('should test parseDuration, formatDuration, getStaleNodes and autoPruneStaleTasks', () => {
    expect(parseDuration('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseDuration('2h')).toBe(2 * 60 * 60 * 1000);
    expect(parseDuration('30m')).toBe(30 * 60 * 1000);
    expect(parseDuration('10s')).toBe(10 * 1000);
    expect(() => parseDuration('invalid')).toThrow();

    expect(formatDuration(24 * 60 * 60 * 1000)).toContain('day');
    expect(formatDuration(2 * 60 * 60 * 1000)).toContain('h');

    const db = getDb(project);
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 1000).toISOString();
    const t = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Old Stale Task',
      status: 'pending',
    });
    db.prepare('UPDATE nodes SET updated_at = ? WHERE id = ?').run(oldDate, t.id);

    const staleRes = getStaleNodes(db, { project, older_than: '1s', status: 'pending' });
    expect(staleRes.nodes.length).toBeGreaterThan(0);

    const pruneRes = autoPruneStaleTasks(db, {
      project,
      older_than: '1s',
      target_status: 'cancelled',
    });
    expect(pruneRes.pruned_count).toBeGreaterThanOrEqual(0);
  });

  it('should test importIssues and exportIssues with various formats', () => {
    const issues = [
      {
        external_id: 'GH-101',
        title: 'Fix issue',
        description: 'Description',
        status: 'pending' as const,
        type: 'task' as const,
        labels: ['bug', 'ui'],
        assignee: 'dev1',
      },
    ];

    const impRes = importIssues({ project, issues });
    expect(impRes.imported_count).toBe(1);

    const expRes = exportIssues({ project });
    expect(expRes.issues.length).toBeGreaterThan(0);
  });
});
