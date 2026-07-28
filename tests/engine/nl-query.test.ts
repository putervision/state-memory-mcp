import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeNLQuery } from '../../src/engine/nl-query.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { getDb, closeDb } from '../../src/engine/db.js';

describe('Natural Language Graph Query Engine', () => {
  const project = 'nl-query-test-project';

  beforeEach(() => {
    closeDb(project);
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  afterEach(() => {
    closeDb(project);
  });

  it('should identify blocker intents and return active blockers', async () => {
    const task = GraphEngine.addNode({ project, type: 'task', title: 'Implement Auth Endpoint' });
    const blocker = GraphEngine.addNode({
      project,
      type: 'blocker',
      title: 'Missing OAuth Secrets',
      status: 'active',
    });
    EdgeEngine.addEdge({ project, source_id: blocker.id, target_id: task.id, type: 'blocks' });

    const res = await executeNLQuery({ project, query: 'what is blocking auth development?' });
    expect(res.intent).toBe('blockers');
    expect(res.matched_nodes.length).toBe(1);
    expect(res.matched_nodes[0].title).toBe('Missing OAuth Secrets');
    expect(res.summary).toContain('Missing OAuth Secrets');
  });

  it('should identify decision intents and return relevant architectural decisions', async () => {
    GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Use SQLite for local memory storage',
      status: 'accepted',
    });

    const res = await executeNLQuery({
      project,
      query: 'what decisions were made about database storage?',
    });
    expect(res.intent).toBe('decisions');
    expect(res.matched_nodes.length).toBeGreaterThan(0);
    expect(res.matched_nodes[0].title).toContain('SQLite');
  });

  it('should identify critical path intents', async () => {
    const t1 = GraphEngine.addNode({ project, type: 'task', title: 'Task 1' });
    const t2 = GraphEngine.addNode({ project, type: 'task', title: 'Task 2' });
    EdgeEngine.addEdge({ project, source_id: t1.id, target_id: t2.id, type: 'depends_on' });

    const res = await executeNLQuery({ project, query: 'what is on the critical path?' });
    expect(res.intent).toBe('critical_path');
    expect(res.matched_nodes.length).toBeGreaterThan(0);
  });

  it('should fallback to general hybrid search for non-keyword queries', async () => {
    GraphEngine.addNode({ project, type: 'task', title: 'Optimize performance metrics' });

    const res = await executeNLQuery({ project, query: 'performance metrics' });
    expect(res.intent).toBe('search');
    expect(res.matched_nodes.length).toBe(1);
    expect(res.matched_nodes[0].title).toBe('Optimize performance metrics');
  });
});
