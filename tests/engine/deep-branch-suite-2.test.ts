import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getDb, closeAllDbs } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { completeTask } from '../../src/engine/complete-task.js';
import { getNextTasks } from '../../src/engine/work-queue.js';
import { calculateSpecCompliance } from '../../src/engine/spec-compliance.js';
import { validateMemoryReferences } from '../../src/engine/cross-memory-validation.js';
import { findCycles } from '../../src/engine/audit.js';
import { vcsBranchSync, vcsMergeResolution } from '../../src/engine/vcs-sync.js';
import { translateLegacyCall } from '../../src/tools/compat-shim.js';

describe('Deep Engine Branch Coverage Suite 2', () => {
  const project = 'deep-branch-suite-2-test';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM events WHERE project = ?').run(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should test completeTask with all option branches', () => {
    const parentTask = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Parent Task',
      status: 'in_progress',
    });
    const subTask = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Sub Task',
      status: 'pending',
    });
    EdgeEngine.addEdge({
      project,
      source_id: subTask.id,
      target_id: parentTask.id,
      type: 'part_of',
    });

    // Complete task with artifacts and visual state
    const res = completeTask({
      project,
      task_id: parentTask.id,
      artifact_title: 'Built Output',
      artifact_metadata: { path: 'dist/out.js' },
      visual_state_id: 'vs-12345',
    });
    expect(res.task.status).toBe('done');
    expect(res.artifact).toBeDefined();
    expect(res.visual_edge).toBeDefined();
  });

  it('should test getNextTasks with capability and dependency branches', () => {
    const db = getDb(project);
    const t1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Task Alpha',
      status: 'pending',
    });
    const t2 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Task Beta',
      status: 'pending',
    });
    EdgeEngine.addEdge({ project, source_id: t2.id, target_id: t1.id, type: 'depends_on' });

    const nextRes = getNextTasks(db, { project, limit: 5 });
    expect(nextRes.tasks.length).toBeGreaterThan(0);
    expect(nextRes.tasks[0].node.id).toBe(t1.id);
  });

  it('should test calculateSpecCompliance branches', () => {
    const db = getDb(project);
    const spec = GraphEngine.addNode({
      project,
      type: 'spec',
      title: 'Auth Spec',
      status: 'active',
    });
    const req = GraphEngine.addNode({
      project,
      type: 'requirement',
      title: 'Password Hashing',
      status: 'pending',
    });
    const task = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Implement Argon2',
      status: 'done',
    });
    EdgeEngine.addEdge({ project, source_id: req.id, target_id: spec.id, type: 'part_of' });
    EdgeEngine.addEdge({ project, source_id: task.id, target_id: req.id, type: 'implements' });

    const matrix = calculateSpecCompliance(db, project);
    expect(matrix.total_specs).toBe(1);
    expect(matrix.coverage_percentage).toBeGreaterThan(0);
  });

  it('should test validateMemoryReferences branches', () => {
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Task with ref',
      metadata: { ref_node: 'missing_id' },
    });

    const valRes = validateMemoryReferences({ project });
    expect(valRes).toBeDefined();
  });

  it('should test findCycles valid and cyclic graphs', () => {
    const n1: any = { id: 'a', type: 'task' };
    const n2: any = { id: 'b', type: 'task' };
    const e1: any = { source_id: 'a', target_id: 'b', type: 'depends_on' };
    const e2: any = { source_id: 'b', target_id: 'a', type: 'depends_on' };

    const cycles = findCycles([n1, n2], [e1, e2]);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('should test vcs-sync and compat-shim branches', () => {
    GraphEngine.addNode({ project, type: 'task', title: 'Branch Task' });

    const syncRes = vcsBranchSync({ project, target_branch: 'main' });
    expect(syncRes).toBeDefined();

    const resolveRes = vcsMergeResolution({
      project,
      source_branch: 'feat',
      target_branch: 'main',
      strategy: 'auto_accept',
    });
    expect(resolveRes).toBeDefined();

    // Legacy tool translation
    const mapped = translateLegacyCall('add_node', { type: 'task', title: 'Shim Task' });
    expect(mapped.tool).toBe('manage_nodes');
    expect(mapped.action).toBe('create');
  });
});
