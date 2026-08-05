import { describe, it, expect, afterAll } from 'vitest';
import { compactGraph } from '../../src/engine/compaction.js';
import { auditProjectDb } from '../../src/engine/audit.js';
import { autoPruneStaleTasks } from '../../src/engine/staleness.js';
import { batchUpdate } from '../../src/engine/batch.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';

describe('More Engine Coverage Suite', () => {
  const project = 'more-eng-cov-project';

  afterAll(() => {
    closeAllDbs();
  });

  it('should run compactGraph with prune_orphaned_edges: true', () => {
    const res = compactGraph({ project, prune_orphaned_edges: true });
    expect(res).toBeDefined();
    expect(typeof res.space_reclaimed_bytes).toBe('number');
  });

  it('should run auditProjectDb with includeSubdirectories: true', async () => {
    const auditRes = await auditProjectDb({ project, includeSubdirectories: true });
    expect(auditRes).toBeDefined();
    expect(auditRes.warnings).toBeDefined();
  });

  it('should autoPruneStaleTasks for idle in_progress tasks', () => {
    const db = getDb(project);
    const oldTask = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Idle old task',
      status: 'in_progress',
    });

    const taskId = oldTask.id || (oldTask as any).node?.id;

    // Set updated_at to 10 days ago so it is detected as stale
    db.prepare("UPDATE nodes SET updated_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(taskId);

    // Prune tasks older than 1 day
    const pruneRes = autoPruneStaleTasks(db, {
      project,
      older_than: '1d',
      target_status: 'cancelled',
    });

    expect(pruneRes.pruned_count).toBeGreaterThanOrEqual(1);
    expect(pruneRes.updated_node_ids).toContain(taskId);
  });

  it('should test batchUpdate for multiple node IDs', () => {
    const db = getDb(project);
    const n1 = GraphEngine.addNode({ project, type: 'task', title: 'Batch 1', status: 'pending' });
    const n2 = GraphEngine.addNode({ project, type: 'task', title: 'Batch 2', status: 'pending' });

    const id1 = n1.id || (n1 as any).node?.id;
    const id2 = n2.id || (n2 as any).node?.id;

    const res = batchUpdate(db, {
      project,
      ids: [id1, id2],
      status: 'done',
    });

    expect(res.updated).toBe(2);
  });
});
