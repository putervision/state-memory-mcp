import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { AnalyticsEngine } from '../../src/engine/analytics.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';

describe('AnalyticsEngine Operations', () => {
  const project = 'analytics-test-project';
  let t1Id: string;
  let t2Id: string;
  let t3Id: string;
  let bId: string;

  beforeAll(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();

    // T1 -> T2 -> T3
    const t3 = GraphEngine.addNode({ project, type: 'task', title: 'Task 3', status: 'pending' });
    const t2 = GraphEngine.addNode({ project, type: 'task', title: 'Task 2', status: 'pending' });
    const t1 = GraphEngine.addNode({ project, type: 'task', title: 'Task 1', status: 'pending' });

    // Blocker node
    const b = GraphEngine.addNode({
      project,
      type: 'blocker',
      title: 'Blocking Issue',
      status: 'active',
    });

    t1Id = t1.id;
    t2Id = t2.id;
    t3Id = t3.id;
    bId = b.id;

    // T1 depends on T2
    EdgeEngine.addEdge({ project, source_id: t1.id, target_id: t2.id, type: 'depends_on' });
    // T2 depends on T3
    EdgeEngine.addEdge({ project, source_id: t2.id, target_id: t3.id, type: 'depends_on' });
    // Blocker blocks T3
    EdgeEngine.addEdge({ project, source_id: b.id, target_id: t3.id, type: 'blocks' });

    // Also a decision for summary
    GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Architectural Decision',
      status: 'accepted',
    });
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should trace upstream dependencies correctly', () => {
    // Upstream of T1 should be T2, T3, and B (since B blocks T3)
    const result = AnalyticsEngine.traceDependencies({
      project,
      node_id: t1Id,
      direction: 'upstream',
    });

    expect(result.has_cycle).toBe(false);
    expect(result.chain.length).toBe(3);

    const ids = result.chain.map((item) => item.node.id);
    expect(ids).toContain(t2Id);
    expect(ids).toContain(t3Id);
    expect(ids).toContain(bId);

    // Verify depths
    const t2Item = result.chain.find((i) => i.node.id === t2Id)!;
    const t3Item = result.chain.find((i) => i.node.id === t3Id)!;
    const bItem = result.chain.find((i) => i.node.id === bId)!;

    expect(t2Item.depth).toBe(1);
    expect(t3Item.depth).toBe(2);
    expect(bItem.depth).toBe(3);
  });

  it('should trace downstream dependencies correctly', () => {
    // Downstream of B should be T3, T2, T1 (since B blocks T3, which blocks T2, which blocks T1)
    const result = AnalyticsEngine.traceDependencies({
      project,
      node_id: bId,
      direction: 'downstream',
    });

    expect(result.has_cycle).toBe(false);
    expect(result.chain.length).toBe(3);

    const ids = result.chain.map((item) => item.node.id);
    expect(ids).toContain(t3Id);
    expect(ids).toContain(t2Id);
    expect(ids).toContain(t1Id);

    // Verify depths
    const t3Item = result.chain.find((i) => i.node.id === t3Id)!;
    const t2Item = result.chain.find((i) => i.node.id === t2Id)!;
    const t1Item = result.chain.find((i) => i.node.id === t1Id)!;

    expect(t3Item.depth).toBe(1);
    expect(t2Item.depth).toBe(2);
    expect(t1Item.depth).toBe(3);
  });

  it('should find active blockers for a specific node transitively', () => {
    const blockers = AnalyticsEngine.findBlockers({
      project,
      node_id: t1Id,
    });

    expect(blockers.length).toBe(1);
    expect(blockers[0].blocker_node.id).toBe(bId);
    expect(blockers[0].blocked_nodes[0].node.id).toBe(t1Id);
  });

  it('should list all blockers and their transitive blocks when node_id is omitted', () => {
    const blockers = AnalyticsEngine.findBlockers({ project });

    expect(blockers.length).toBe(1);
    expect(blockers[0].blocker_node.id).toBe(bId);

    const blockedIds = blockers[0].blocked_nodes.map((item) => item.node.id);
    expect(blockedIds).toContain(t3Id);
    expect(blockedIds).toContain(t2Id);
    expect(blockedIds).toContain(t1Id);
  });

  it('should return a correct project summary', () => {
    const summary = AnalyticsEngine.getProjectSummary({ project });

    expect(summary.node_counts.task).toBe(3);
    expect(summary.node_counts.blocker).toBe(1);
    expect(summary.node_counts.decision).toBe(1);

    expect(summary.status_breakdown.task.pending).toBe(3);
    expect(summary.active_blockers.length).toBe(1);
    expect(summary.recent_decisions.length).toBe(1);
    expect(summary.progress.total_tasks).toBe(3);
    expect(summary.progress.completed_tasks).toBe(0);
    expect(summary.progress.pct).toBe(0);

    // If we mark one task as done, verify progress changes
    GraphEngine.updateNode({ project, id: t3Id, status: 'done' });

    const updatedSummary = AnalyticsEngine.getProjectSummary({ project });
    expect(updatedSummary.progress.completed_tasks).toBe(1);
    expect(updatedSummary.progress.pct).toBe(33); // 1 out of 3 is 33%
  });
});
