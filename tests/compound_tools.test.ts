import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getDb, closeAllDbs } from '../src/engine/db.js';
import { bootstrapSession } from '../src/engine/bootstrap.js';
import { completeTask } from '../src/engine/complete-task.js';
import { batchCreateNodes, batchAddEdges } from '../src/engine/batch.js';
import { GraphEngine } from '../src/engine/graph.js';

describe('Compound Tools Unit & Integration Tests', () => {
  const project = 'compound-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();
    db.prepare('DELETE FROM sessions').run();
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('bootstrap_session should start a session, get snapshot and next tasks', () => {
    const res = bootstrapSession({
      project,
      agent_id: 'test-agent',
      task_limit: 3,
    });

    expect(res.session_id).toBeDefined();
    expect(res.context_snapshot).toBeDefined();
    expect(res.next_tasks).toEqual([]);
    expect(res.summary).toContain('0 unblocked tasks');
  });

  it('complete_task should set task status to done and produce artifact', () => {
    const task = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Build Feature X',
      status: 'in_progress',
    });

    const res = completeTask({
      project,
      task_id: task.id,
      artifact_title: 'Feature X Output',
      artifact_metadata: { size: 1024 },
      tags: ['release'],
    });

    expect(res.task.status).toBe('done');
    expect(res.artifact).toBeDefined();
    expect(res.artifact!.title).toBe('Feature X Output');
    expect(res.artifact!.type).toBe('artifact');
    expect(res.edge).toBeDefined();
    expect(res.edge!.type).toBe('produces');
    expect(res.edge!.source_id).toBe(task.id);
    expect(res.edge!.target_id).toBe(res.artifact!.id);
  });

  it('batch_create_nodes should atomically create multiple nodes', () => {
    const db = getDb(project);
    const res = batchCreateNodes(db, {
      project,
      nodes: [
        { type: 'task', title: 'Batch Task 1', tags: ['b1'] },
        { type: 'task', title: 'Batch Task 2', tags: ['b2'] },
        { type: 'decision', title: 'Batch Decision', status: 'accepted' },
      ],
    });

    expect(res.created_nodes.length).toBe(3);
    expect(res.created_nodes[0].title).toBe('Batch Task 1');
    expect(res.created_nodes[1].title).toBe('Batch Task 2');
    expect(res.created_nodes[2].type).toBe('decision');
  });

  it('batch_add_edges should atomically link edges and rollback on cycle', () => {
    const db = getDb(project);
    const n1 = GraphEngine.addNode({ project, type: 'task', title: 'Task A' });
    const n2 = GraphEngine.addNode({ project, type: 'task', title: 'Task B' });
    const n3 = GraphEngine.addNode({ project, type: 'task', title: 'Task C' });

    // Valid batch
    const validRes = batchAddEdges(db, {
      project,
      edges: [
        { source_id: n1.id, target_id: n2.id, type: 'depends_on' },
        { source_id: n2.id, target_id: n3.id, type: 'depends_on' },
      ],
    });
    expect(validRes.created_edges.length).toBe(2);

    // Invalid batch causing cycle: n3 -> n1
    expect(() => {
      batchAddEdges(db, {
        project,
        edges: [
          { source_id: n3.id, target_id: n1.id, type: 'depends_on' },
        ],
      });
    }).toThrow(/circular dependency/i);
  });
});
