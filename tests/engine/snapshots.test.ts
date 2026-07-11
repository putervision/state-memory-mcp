import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { SnapshotEngine } from '../../src/engine/snapshots.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';

describe('SnapshotEngine Integration Tests', () => {
  const project = 'snapshot-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM snapshots').run();
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should save and list context snapshots', () => {
    const db = getDb(project);
    GraphEngine.addNode({ project, type: 'task', title: 'Task 1' });
    GraphEngine.addNode({ project, type: 'task', title: 'Task 2' });

    const snap = SnapshotEngine.saveSnapshot(db, { project });
    expect(snap.snapshot_id).toBeDefined();
    expect(snap.node_count).toBe(2);
    expect(snap.edge_count).toBe(0);

    const list = SnapshotEngine.listSnapshots(db, { project });
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(snap.snapshot_id);
    expect(list[0].node_count).toBe(2);
  });

  it('should semantic diff two saved snapshots', () => {
    const db = getDb(project);

    // Snapshot A
    const n1 = GraphEngine.addNode({ project, type: 'task', title: 'Node 1', status: 'pending' });
    const snapA = SnapshotEngine.saveSnapshot(db, { project });

    // Node modified (status update), Node added, Edge added
    GraphEngine.updateNode({ project, id: n1.id, status: 'in_progress' });
    const n2 = GraphEngine.addNode({ project, type: 'task', title: 'Node 2' });
    EdgeEngine.addEdge({ project, source_id: n1.id, target_id: n2.id, type: 'depends_on' });

    // Snapshot B
    const snapB = SnapshotEngine.saveSnapshot(db, { project });

    const diff = SnapshotEngine.diffSnapshots(db, {
      project,
      snapshot_id_a: snapA.snapshot_id,
      snapshot_id_b: snapB.snapshot_id,
    });

    expect(diff.nodes_added.length).toBe(1);
    expect(diff.nodes_added[0].id).toBe(n2.id);

    expect(diff.status_changes.length).toBe(1);
    expect(diff.status_changes[0].node_id).toBe(n1.id);
    expect(diff.status_changes[0].before_status).toBe('pending');
    expect(diff.status_changes[0].after_status).toBe('in_progress');

    expect(diff.edges_added.length).toBe(1);
    expect(diff.edges_added[0].source_id).toBe(n1.id);
    expect(diff.edges_added[0].target_id).toBe(n2.id);

    expect(diff.nodes_removed.length).toBe(0);
    expect(diff.edges_removed.length).toBe(0);
  });

  it('should enforce tiered memory limits on saveSnapshot', () => {
    const db = getDb(project);

    // Insert 10,001 mock nodes in a fast transaction
    db.transaction(() => {
      for (let i = 0; i <= 10000; i++) {
        db.prepare(
          'INSERT INTO nodes (id, type, title, status, project, created_at, updated_at) ' +
            "VALUES (?, 'task', ?, 'pending', ?, datetime('now'), datetime('now'))"
        ).run(`mock-${i}`, `Mock Node ${i}`, project);
      }
    })();

    // Attempting to save snapshot without force: true should throw Error
    expect(() => {
      SnapshotEngine.saveSnapshot(db, { project });
    }).toThrow(/Snapshot aborted: graph contains 10001 nodes/);

    // Attempting to save snapshot with force: true should succeed
    const snap = SnapshotEngine.saveSnapshot(db, { project, force: true });
    expect(snap.snapshot_id).toBeDefined();
    expect(snap.node_count).toBe(10001);
  });
});
