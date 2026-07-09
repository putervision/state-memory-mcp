import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';
import { AnalyticsEngine } from '../../src/engine/analytics.js';

describe('Agent-Centric Features Integration Tests', () => {
  const project = 'agent-features-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should generate get_context_snapshot correctly', () => {
    // 1. Add some tasks, blockers, decisions
    const t1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Task A',
      status: 'pending',
    });

    const b1 = GraphEngine.addNode({
      project,
      type: 'blocker',
      title: 'Blocker B',
      status: 'active',
    });

    EdgeEngine.addEdge({
      project,
      source_id: b1.id,
      target_id: t1.id,
      type: 'blocks',
    });

    const snapshot = AnalyticsEngine.getContextSnapshot({ project });
    expect(snapshot).toHaveProperty('summary');
    expect(snapshot).toHaveProperty('active_blockers');
    expect(snapshot).toHaveProperty('pending_tasks');
    expect(snapshot).toHaveProperty('formatted_summary');

    expect(snapshot.active_blockers.length).toBe(1);
    expect(snapshot.pending_tasks.length).toBe(1);
    expect(snapshot.formatted_summary).toContain('State Graph Context Snapshot');
    expect(snapshot.formatted_summary).toContain('Blocker B');
    expect(snapshot.formatted_summary).toContain('Task A');
  });

  it('should find related decisions for an artifact', () => {
    const d1 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Decision 1',
      status: 'accepted',
    });

    const art = GraphEngine.addNode({
      project,
      type: 'artifact',
      title: 'Artifact 1',
      status: 'current',
    });

    // Directly produces
    EdgeEngine.addEdge({
      project,
      source_id: d1.id,
      target_id: art.id,
      type: 'produces',
    });

    const decisions = AnalyticsEngine.findRelatedDecisions({ project, artifact_id: art.id });
    expect(decisions.length).toBe(1);
    expect(decisions[0].id).toBe(d1.id);
  });

  it('should find blocked tasks for a decision', () => {
    const d1 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Decision 1',
      status: 'accepted',
    });

    const t1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Task 1',
      status: 'pending',
    });

    // Link decision to task via blocks/decided_in/depends_on
    EdgeEngine.addEdge({
      project,
      source_id: d1.id,
      target_id: t1.id,
      type: 'blocks',
    });

    const tasks = AnalyticsEngine.findBlockedTasks({ project, decision_id: d1.id });
    expect(tasks.length).toBe(1);
    expect(tasks[0].id).toBe(t1.id);
  });
});
