import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getVelocityAnalytics, getBurndownChart } from '../../src/engine/velocity-analytics.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { getDb, closeDb } from '../../src/engine/db.js';

describe('Velocity & Time-Series Burndown Analytics Engine', () => {
  const project = 'velocity-test-project';

  beforeEach(() => {
    closeDb(project);
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  afterEach(() => {
    closeDb(project);
  });

  it('should calculate velocity analytics and task throughput metrics', () => {
    const t1 = GraphEngine.addNode({ project, type: 'task', title: 'Task 1' });
    const t2 = GraphEngine.addNode({ project, type: 'task', title: 'Task 2' });

    GraphEngine.updateNode({ project, id: t1.id, status: 'done' });

    const vel = getVelocityAnalytics({ project, window_days: 7 });

    expect(vel.window_days).toBe(7);
    expect(vel.tasks_created).toBe(2);
    expect(vel.tasks_completed).toBe(1);
    expect(vel.velocity_per_day).toBeGreaterThan(0);
    expect(vel.daily_metrics.length).toBe(7);
  });

  it('should generate burndown chart points and estimated days remaining', () => {
    const t1 = GraphEngine.addNode({ project, type: 'task', title: 'Task 1' });
    const t2 = GraphEngine.addNode({ project, type: 'task', title: 'Task 2' });
    GraphEngine.updateNode({ project, id: t1.id, status: 'done' });

    const burn = getBurndownChart({ project, days: 7 });

    expect(burn.total_scope).toBe(2);
    expect(burn.completed_tasks).toBe(1);
    expect(burn.remaining_tasks).toBe(1);
    expect(burn.burndown_points.length).toBe(7);
  });
});
