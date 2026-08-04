import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { executeNLQuery } from '../../src/engine/nl-query.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { closeAllDbs } from '../../src/engine/db.js';

describe('Natural Language Query Engine (executeNLQuery)', () => {
  const project = 'nl-query-extended-test-project';

  beforeAll(() => {
    // Seed test nodes
    const milestone = GraphEngine.addNode({
      project,
      type: 'milestone',
      title: 'v1.0 Milestone Release',
      status: 'in_progress',
    });

    const task = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Implement Core Feature',
      status: 'pending',
    });

    EdgeEngine.addEdge({
      project,
      source_id: task.id,
      target_id: milestone.id,
      type: 'child_of',
    });

    const blocker = GraphEngine.addNode({
      project,
      type: 'blocker',
      title: 'Network Timeout Bug',
      status: 'active',
    });

    EdgeEngine.addEdge({
      project,
      source_id: blocker.id,
      target_id: task.id,
      type: 'blocks',
    });

    GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Architecture Decision for Cache',
      status: 'accepted',
    });
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should match blocker intent for queries asking about blockers', async () => {
    const res = await executeNLQuery({
      project,
      query: 'What is blocking progress or stuck?',
    });
    expect(res.intent).toBe('blockers');
    expect(res.matched_nodes.length).toBeGreaterThan(0);
    expect(res.summary).toContain('active blocker');
  });

  it('should match decision intent for queries asking about architectural choices', async () => {
    const res = await executeNLQuery({
      project,
      query: 'What architecture decisions were made?',
    });
    expect(res.intent).toBe('decisions');
    expect(res.matched_nodes.length).toBeGreaterThan(0);
    expect(res.summary).toContain('decision node');
  });

  it('should match critical path intent for priority task queries', async () => {
    const res = await executeNLQuery({
      project,
      query: 'Show me the critical path and priority tasks',
    });
    expect(res.intent).toBe('critical_path');
    expect(res.summary).toMatch(/Critical path|priority task/);
  });

  it('should match stale nodes intent for queries asking about outdated tasks', async () => {
    const res = await executeNLQuery({
      project,
      query: 'Find stale or neglected nodes',
    });
    expect(res.intent).toBe('stale_nodes');
    expect(res.summary).toContain('stale node');
  });

  it('should match spec compliance intent for PRD requirement queries', async () => {
    const res = await executeNLQuery({
      project,
      query: 'Check spec compliance coverage and criteria',
    });
    expect(res.intent).toBe('spec_compliance');
    expect(res.summary).toContain('Spec Compliance Coverage');
  });

  it('should fallback to general text search when no specific intent matches', async () => {
    const res = await executeNLQuery({
      project,
      query: 'Core Feature',
    });
    expect(res.intent).toBe('search');
    expect(res.matched_nodes.length).toBeGreaterThan(0);
    expect(res.summary).toContain('Search returned');
  });
});
