import { describe, it, expect, afterAll } from 'vitest';
import { AnalyticsEngine } from '../../src/engine/analytics/index.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { closeAllDbs } from '../../src/engine/db.js';

describe('AnalyticsEngine Extended Coverage Suite', () => {
  const project = 'analytics-ext-cov-project';

  afterAll(() => {
    closeAllDbs();
  });

  it('should detect contradictions when a done task is blocked and decisions contradict', () => {
    const doneTask = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Done task blocked by active blocker',
      status: 'done',
    });

    const activeBlocker = GraphEngine.addNode({
      project,
      type: 'blocker',
      title: 'Active Blocker Node',
      status: 'active',
    });

    EdgeEngine.addEdge({
      project,
      source_id: activeBlocker.id || (activeBlocker as any).node?.id,
      target_id: doneTask.id || (doneTask as any).node?.id,
      type: 'blocks',
    });

    const d1 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Decision Option A',
      status: 'accepted',
    });

    const d2 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Decision Option B',
      status: 'accepted',
    });

    EdgeEngine.addEdge({
      project,
      source_id: d1.id || (d1 as any).node?.id,
      target_id: d2.id || (d2 as any).node?.id,
      type: 'contradicts',
    });

    const res = AnalyticsEngine.detectContradictions({ project });
    expect(res.blocked_done_tasks.length).toBeGreaterThanOrEqual(1);
    expect(res.contradicting_decisions.length).toBeGreaterThanOrEqual(1);
  });

  it('should test decisionTrail and criticalPath analytics', () => {
    const dec = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Root Architecture Decision',
      status: 'accepted',
    });

    const decId = dec.id || (dec as any).node?.id;

    const task = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Dependent Task A',
      status: 'in_progress',
    });

    EdgeEngine.addEdge({
      project,
      source_id: task.id || (task as any).node?.id,
      target_id: decId,
      type: 'decided_in',
    });

    const trail = AnalyticsEngine.decisionTrail({ project, node_id: decId });
    expect(trail).toBeDefined();

    expect(() =>
      AnalyticsEngine.decisionTrail({ project, node_id: 'non-existent-dec-id' })
    ).toThrow('Decision node not found');

    const milestone = GraphEngine.addNode({
      project,
      type: 'milestone',
      title: 'Target Milestone A',
      status: 'pending',
    });

    const msId = milestone.id || (milestone as any).node?.id;

    const pathRes = AnalyticsEngine.criticalPath({ project, milestone_id: msId });
    expect(pathRes).toBeDefined();

    expect(() =>
      AnalyticsEngine.criticalPath({ project, milestone_id: 'non-existent-ms-id' })
    ).toThrow('Milestone node not found');
  });
});
