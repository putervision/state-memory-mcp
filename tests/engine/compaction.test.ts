import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { compactGraph, archiveCompletedNodes } from '../../src/engine/compaction.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { getDb, closeDb } from '../../src/engine/db.js';

describe('Automated Graph Compaction & Historical Archiving Engine', () => {
  const project = 'compaction-test-project';

  beforeEach(() => {
    closeDb(project);
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  afterEach(() => {
    closeDb(project);
  });

  it('should flag old completed tasks as archived', () => {
    const db = getDb(project);
    db.prepare(
      `
      INSERT INTO nodes (id, type, title, status, project, git_branch, metadata, tags, created_at, updated_at)
      VALUES ('old-task-1', 'task', 'Old Task', 'done', ?, 'main', '{}', '[]', datetime('now', '-40 days'), datetime('now', '-40 days'))
    `
    ).run(project);

    const res = archiveCompletedNodes({ project, older_than_days: 30 });
    expect(res.archived_nodes_count).toBe(1);
    expect(res.node_ids).toContain('old-task-1');
  });

  it('should optimize FTS and reclaim space with compactGraph', () => {
    GraphEngine.addNode({ project, type: 'task', title: 'Task to Compact' });

    const res = compactGraph({ project, prune_orphaned_edges: true });
    expect(res.database_bytes_before).toBeGreaterThan(0);
    expect(res.database_bytes_after).toBeGreaterThan(0);
    expect(res.pruned_edges_count).toBe(0);
  });
});
