import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { closeAllDbs, getDb } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { AnalyticsEngine } from '../../src/engine/analytics.js';

describe('Value Metrics Engine', () => {
  const project = 'metrics-test-project';

  afterAll(() => {
    closeAllDbs();
  });

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  it('should return default zero metrics for empty project', () => {
    const metrics = AnalyticsEngine.valueMetrics({ project });

    expect(metrics.total_nodes).toBe(0);
    expect(metrics.total_edges).toBe(0);
    expect(metrics.context_switches_saved).toBe(0);
    expect(metrics.dependency_lookups_saved).toBe(0);
    expect(metrics.estimated_time_saved_minutes).toBe(0);
    expect(metrics.markdown_summary).toContain('0.0 hours');
  });

  it('should compute correct ROI and health metrics after nodes and edges are added', () => {
    const db = getDb(project);

    // 1. Add 3 accepted decisions
    const d1 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Decide SQLite for storage',
      status: 'accepted',
      metadata: { rationale: 'Simple local db file.' },
    });
    const d2 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Decide tsup for bundling',
      status: 'accepted',
      metadata: { rationale: 'Fast and outputs ESM.' },
    });
    const d3 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Decide vitest for testing',
      status: 'rejected', // Rejected decision (not counted towards switches saved)
      metadata: { rationale: 'Not using this.' },
    });

    // 2. Add 4 tasks: 2 done, 2 pending
    const t1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Setup bundler',
      status: 'done',
    });
    const t2 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Configure DB schema',
      status: 'done',
    });
    const t3 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Write tests',
      status: 'pending',
    });
    const t4 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Deploy server',
      status: 'pending',
    });

    // 3. Add 1 blocker (resolved)
    const b1 = GraphEngine.addNode({
      project,
      type: 'blocker',
      title: 'Missing Node version 18 config',
      status: 'resolved',
    });

    // 4. Link relationships (edges)
    // Add 3 depends_on edges (structural)
    EdgeEngine.addEdge({
      project,
      source_id: t2.id,
      target_id: t1.id,
      type: 'depends_on',
    });
    EdgeEngine.addEdge({
      project,
      source_id: t3.id,
      target_id: t2.id,
      type: 'depends_on',
    });
    // Add non-structural edge
    EdgeEngine.addEdge({
      project,
      source_id: d1.id,
      target_id: t2.id,
      type: 'decided_in',
    });

    // Compute metrics
    const metrics = AnalyticsEngine.valueMetrics({ project });

    // Assert counts
    expect(metrics.total_nodes).toBe(8);
    expect(metrics.total_edges).toBe(3);

    // Heuristics checks
    // 2 accepted decisions (d1, d2)
    expect(metrics.context_switches_saved).toBe(2);
    // 2 structural depends_on edges
    expect(metrics.dependency_lookups_saved).toBe(2);
    // 1 resolved blocker
    // Time saved: 2 decisions * 10min (20) + 2 depends_on * 3min (6) + 1 blocker * 15min (15) = 41min
    expect(metrics.estimated_time_saved_minutes).toBe(41);

    // Graph health
    expect(metrics.orphan_node_count).toBe(4); // d2, d3, t4, b1 are not connected to anything
    expect(metrics.decision_reuse_rate).toBe(0.5); // d1 is used, d2 is not (1/2 = 0.5)

    // Completion / velocity
    expect(metrics.task_completion_rate).toBe(0.5); // 2 out of 4 tasks are done (50%)

    // Check pre-rendered Markdown
    expect(metrics.markdown_summary).toContain('State Graph Value & ROI Metrics');
    expect(metrics.markdown_summary).toContain('0.7 hours'); // 41 minutes / 60 = 0.68 -> 0.7 hours
    expect(metrics.markdown_summary).toContain('50%');
  });
});
