import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vcsBranchSync, vcsMergeResolution } from '../../src/engine/vcs-sync.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { getDb, closeDb } from '../../src/engine/db.js';

describe('VCS / Git Branch Sync & Merge Resolution Engine', () => {
  const project = 'vcs-sync-test-project';

  beforeEach(() => {
    closeDb(project);
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  afterEach(() => {
    closeDb(project);
  });

  it('should analyze state nodes created on current branch vs target branch', () => {
    const node = GraphEngine.addNode({ project, type: 'task', title: 'Branch Feature Task' });

    const res = vcsBranchSync({ project, target_branch: 'main' });

    expect(res.current_branch).toBeDefined();
    expect(res.target_branch).toBe('main');
    expect(res.branch_nodes_count).toBeGreaterThan(0);
  });

  it('should detect state conflicts when merging source and target branches', () => {
    const db = getDb(project);

    // Insert same node ID on branch-a and branch-b with conflicting statuses
    db.prepare(
      `
      INSERT INTO nodes (id, type, title, status, project, git_branch, metadata, tags, created_at, updated_at)
      VALUES ('node-conflict-a', 'task', 'Conflicting Task', 'done', ?, 'branch-a', '{}', '[]', datetime('now'), datetime('now'))
    `
    ).run(project);

    db.prepare(
      `
      INSERT INTO nodes (id, type, title, status, project, git_branch, metadata, tags, created_at, updated_at)
      VALUES ('node-conflict-b', 'task', 'Conflicting Task', 'pending', ?, 'branch-b', '{}', '[]', datetime('now'), datetime('now'))
    `
    ).run(project);

    const res = vcsMergeResolution({
      project,
      source_branch: 'branch-a',
      target_branch: 'branch-b',
      strategy: 'flag_conflicts',
    });

    expect(res.conflict_count).toBe(1);
    expect(res.conflicts[0].node_id).toBe('node-conflict-a');
    expect(res.conflicts[0].source_status).toBe('done');
    expect(res.conflicts[0].target_status).toBe('pending');
  });
});
