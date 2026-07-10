import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { AnalyticsEngine } from '../../src/engine/analytics.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';

describe('Advanced Analytics Engine', () => {
  const project = 'adv-analytics-test-project';

  beforeAll(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should compute decision trail and find contradictions', () => {
    const d1 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Decision 1',
      status: 'accepted',
    });
    const d2 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Decision 2',
      status: 'accepted',
    });
    const d3 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Decision 3',
      status: 'accepted',
    });

    // d2 updates d1, d3 updates d2
    EdgeEngine.addEdge({ project, source_id: d2.id, target_id: d1.id, type: 'updates' });
    EdgeEngine.addEdge({ project, source_id: d3.id, target_id: d2.id, type: 'updates' });

    // d3 contradicts d1
    EdgeEngine.addEdge({ project, source_id: d3.id, target_id: d1.id, type: 'contradicts' });

    const result = AnalyticsEngine.decisionTrail({ project, node_id: d3.id });
    expect(result.decisions.length).toBe(3);
    expect(result.contradictions.length).toBe(1);
    expect(result.contradictions[0].source_id).toBe(d3.id);
    expect(result.contradictions[0].target_id).toBe(d1.id);
  });

  it('should compute critical path for milestones based on estimates', () => {
    // Clean tables for this test
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();

    const m = GraphEngine.addNode({ project, type: 'milestone', title: 'Milestone 1' });

    // T1 -> T2 -> T3 -> Milestone
    const t1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Task 1',
      status: 'pending',
      metadata: { estimate: '3h' },
    });
    const t2 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Task 2',
      status: 'pending',
      metadata: { estimate: 5 },
    });
    const t3 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Task 3',
      status: 'pending',
      metadata: { estimate: '2.5h' },
    });

    EdgeEngine.addEdge({ project, source_id: t3.id, target_id: t2.id, type: 'depends_on' });
    EdgeEngine.addEdge({ project, source_id: t2.id, target_id: t1.id, type: 'depends_on' });

    // Milestone is blocked by T3
    EdgeEngine.addEdge({ project, source_id: t3.id, target_id: m.id, type: 'child_of' }); // X child_of Y (Milestone)

    const result = AnalyticsEngine.criticalPath({ project, milestone_id: m.id });

    // Path should be [T1, T2, T3, Milestone]
    expect(result.path.length).toBe(4);
    expect(result.path[0].id).toBe(t1.id);
    expect(result.path[3].id).toBe(m.id);

    // Estimates sum: T1(3) + T2(5) + T3(2.5) + Milestone(1 default) = 11.5
    expect(result.total_estimate_hours).toBe(11.5);
  });

  it('should perform impact analysis downstream', () => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();

    const n1 = GraphEngine.addNode({ project, type: 'task', title: 'Core API' });
    const n2 = GraphEngine.addNode({ project, type: 'task', title: 'Web Dashboard' });
    const n3 = GraphEngine.addNode({ project, type: 'task', title: 'Auth Subsystem' });

    // Web Dashboard depends on Core API, Core API depends on Auth
    EdgeEngine.addEdge({ project, source_id: n2.id, target_id: n1.id, type: 'depends_on' });
    EdgeEngine.addEdge({ project, source_id: n1.id, target_id: n3.id, type: 'depends_on' });

    // Impact of Auth should downstream to Core API and Web Dashboard
    const result = AnalyticsEngine.impactAnalysis({ project, node_id: n3.id });
    expect(result.affected_nodes.length).toBe(2);

    const ids = result.affected_nodes.map((n) => n.id);
    expect(ids).toContain(n1.id);
    expect(ids).toContain(n2.id);
  });

  it('should detect contradictions in tasks and decisions', () => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();

    const t = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Completed Task',
      status: 'done',
    });
    const b = GraphEngine.addNode({
      project,
      type: 'blocker',
      title: 'Active Blocker',
      status: 'active',
    });

    // Blocker blocks task
    EdgeEngine.addEdge({ project, source_id: b.id, target_id: t.id, type: 'blocks' });

    // Accepted contradicting decisions
    const d1 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Accepted 1',
      status: 'accepted',
    });
    const d2 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Accepted 2',
      status: 'accepted',
    });
    EdgeEngine.addEdge({ project, source_id: d1.id, target_id: d2.id, type: 'contradicts' });

    const result = AnalyticsEngine.detectContradictions({ project });

    expect(result.blocked_done_tasks.length).toBe(1);
    expect(result.blocked_done_tasks[0].task.id).toBe(t.id);
    expect(result.blocked_done_tasks[0].blocker.id).toBe(b.id);

    expect(result.contradicting_decisions.length).toBe(1);
    expect(result.contradicting_decisions[0].decision1.id).toBe(d1.id);
    expect(result.contradicting_decisions[0].decision2.id).toBe(d2.id);
  });
});
