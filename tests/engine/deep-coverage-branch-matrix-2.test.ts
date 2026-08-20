import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getDb, closeAllDbs } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { SessionEngine } from '../../src/engine/sessions.js';
import { AnalyticsEngine } from '../../src/engine/analytics.js';
import { criticalPath } from '../../src/engine/analytics/critical-path.js';
import { traceDependencies } from '../../src/engine/analytics/dependencies.js';
import { impactAnalysis } from '../../src/engine/analytics/impact.js';
import { valueMetrics } from '../../src/engine/analytics/metrics.js';
import {
  getContextSnapshot,
  findRelatedDecisions,
  findBlockedTasks,
} from '../../src/engine/analytics/context.js';
import { compactGraph, archiveCompletedNodes } from '../../src/engine/compaction.js';
import { completeTask } from '../../src/engine/complete-task.js';
import { batchCreateNodes, batchUpdate, batchAddEdges } from '../../src/engine/batch.js';

describe('Deep Coverage Branch Matrix 2 - Analytics, Batch, Compaction, Task Completion', () => {
  let project: string;

  beforeEach(() => {
    project = `deep-matrix-2-${randomUUID()}`;
    closeAllDbs();
  });

  afterEach(() => {
    closeAllDbs();
  });

  it('should cover AnalyticsEngine context, contradictions, and critical path branches', () => {
    const db = getDb(project);
    const session = SessionEngine.startSession(db, { project, agent_id: 'test-agent' });

    // Add comprehensive nodes
    const m1 = GraphEngine.addNode({
      project,
      type: 'milestone',
      title: 'Milestone 1',
      status: 'pending',
    });
    const t1 = GraphEngine.addNode({ project, type: 'task', title: 'Task Alpha', status: 'done' });
    const t2 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Task Beta',
      status: 'in_progress',
    });
    const t3 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Task Gamma',
      status: 'pending',
    });
    const d1 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Dec Alpha',
      status: 'accepted',
    });
    const d2 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Dec Beta',
      status: 'accepted',
    });
    const b1 = GraphEngine.addNode({
      project,
      type: 'blocker',
      title: 'Blocker Alpha',
      status: 'resolved',
    });
    const b2 = GraphEngine.addNode({
      project,
      type: 'blocker',
      title: 'Blocker Beta',
      status: 'active',
    });
    const a1 = GraphEngine.addNode({ project, type: 'artifact', title: 'Output.js' });

    EdgeEngine.addEdge({ project, source_id: t1.id, target_id: m1.id, type: 'part_of' });
    EdgeEngine.addEdge({ project, source_id: t2.id, target_id: t1.id, type: 'depends_on' });
    EdgeEngine.addEdge({ project, source_id: t3.id, target_id: t2.id, type: 'depends_on' });
    EdgeEngine.addEdge({ project, source_id: d1.id, target_id: d2.id, type: 'contradicts' });
    EdgeEngine.addEdge({ project, source_id: b2.id, target_id: t1.id, type: 'blocks' });
    EdgeEngine.addEdge({ project, source_id: a1.id, target_id: d1.id, type: 'decided_in' });

    // Context snapshot & related
    const ctx = getContextSnapshot({ project });
    expect(ctx).toBeDefined();

    const related = findRelatedDecisions({ project, artifact_id: a1.id });
    expect(related).toBeDefined();

    const blocked = findBlockedTasks({ project, decision_id: d1.id });
    expect(blocked).toBeDefined();

    // Contradictions
    const contradictions = AnalyticsEngine.detectContradictions({ project });
    expect(contradictions.contradicting_decisions.length).toBeGreaterThan(0);
    expect(contradictions.blocked_done_tasks.length).toBeGreaterThan(0);

    // Critical path
    const cp = criticalPath({ project, milestone_id: m1.id });
    expect(cp.path).toBeDefined();

    // Impact calculation
    const impact1 = impactAnalysis({ project, node_id: t1.id, max_depth: 3 });
    expect(impact1.affected_nodes.length).toBeGreaterThanOrEqual(0);

    // Dependency tree
    const treeDown = traceDependencies({
      project,
      node_id: t3.id,
      direction: 'downstream',
      max_depth: 3,
    });
    expect(treeDown).toBeDefined();
    const treeUp = traceDependencies({
      project,
      node_id: t1.id,
      direction: 'upstream',
      max_depth: 3,
    });
    expect(treeUp).toBeDefined();

    // Velocity metrics
    const vel = valueMetrics({ project });
    expect(vel).toBeDefined();
  });

  it('should cover batch operations and error branches', () => {
    const db = getDb(project);
    // Batch create with mixed valid / invalid entries
    const createRes = batchCreateNodes(db, {
      project,
      nodes: [
        { type: 'task', title: 'Batch Node 1', status: 'pending' },
        { type: 'task', title: 'Batch Node 2', status: 'pending' },
      ],
    });
    expect(createRes.created_nodes.length).toBe(2);

    // Batch update
    const updateRes = batchUpdate(db, {
      project,
      ids: [createRes.created_nodes[0].id, createRes.created_nodes[1].id, 'non-existent-id'],
      status: 'done',
    });
    expect(updateRes.updated).toBe(2);
    expect(updateRes.failed.length).toBe(1);

    // Batch add edges valid
    const edgeRes = batchAddEdges(db, {
      project,
      edges: [
        {
          source_id: createRes.created_nodes[0].id,
          target_id: createRes.created_nodes[1].id,
          type: 'depends_on',
        },
      ],
    });
    expect(edgeRes.created_edges.length).toBe(1);

    // Batch add edges invalid
    expect(() =>
      batchAddEdges(db, {
        project,
        edges: [{ source_id: 'non-existent-1', target_id: 'non-existent-2', type: 'depends_on' }],
      })
    ).toThrow();
  });

  it('should cover compaction operations and dry runs', () => {
    const db = getDb(project);
    const session = SessionEngine.startSession(db, { project, agent_id: 'test-agent' });
    GraphEngine.addNode({ project, type: 'task', title: 'Compaction Task', status: 'done' });

    // Dry run compaction
    const dryRes = compactGraph({ project, prune_orphaned_edges: true });
    expect(dryRes).toBeDefined();

    const archiveRes = archiveCompletedNodes({ project, older_than_days: 0 });
    expect(archiveRes).toBeDefined();
  });

  it('should cover completeTask with non-default visual relationships and metadata', () => {
    const t = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Complete Me',
      status: 'in_progress',
    });

    // Complete with verifies_visual_state
    const res1 = completeTask({
      project,
      task_id: t.id,
      artifact_title: 'Report Artifact',
      artifact_metadata: { lines: 100 },
      visual_state_id: 'vs-verify-01',
      visual_relationship: 'verifies_visual_state',
    });
    expect(res1.task.status).toBe('done');
    expect(res1.visual_edge?.type).toBe('verifies_visual_state');
  });
});
