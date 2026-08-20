import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { QueryEngine } from '../../src/engine/queries.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';
import { SynergyEngine } from '../../src/engine/synergy.js';
import { importGraph } from '../../src/engine/import.js';

describe('Queries & Engine Exhaustive Test Suite', () => {
  const project = 'queries-exhaustive-test';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
    db.prepare('DELETE FROM sessions WHERE project = ?').run(project);
    db.prepare('DELETE FROM events WHERE project = ?').run(project);
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should test searchNodes with FTS fallback and syntax handling', async () => {
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Compile TypeScript Sources',
      status: 'pending',
    });
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Bundle Webpack Packages',
      status: 'pending',
    });

    // Exact query
    const res1 = await QueryEngine.searchNodes({
      project,
      query: 'TypeScript',
      fields: ['id', 'title'],
    });
    expect(res1.nodes.length).toBeGreaterThan(0);
    expect(res1.nodes[0].title).toBe('Compile TypeScript Sources');

    // TF-IDF algorithm explicit
    const res2 = await QueryEngine.searchNodes({ project, query: 'Webpack', algorithm: 'tfidf' });
    expect(res2.nodes.length).toBeGreaterThan(0);

    // Broken FTS syntax query triggering fallback
    const res3 = await QueryEngine.searchNodes({ project, query: 'AND NOT "(((' });
    expect(res3).toBeDefined();
  });

  it('should test listNodes filtering and field projection', async () => {
    const n1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Task Alpha',
      status: 'done',
      tags: ['core'],
    });
    const n2 = GraphEngine.addNode({
      project,
      type: 'blocker',
      title: 'Blocker Beta',
      status: 'active',
      tags: ['bug'],
    });

    const listByTag = await QueryEngine.listNodes({
      project,
      tags: ['core'],
      fields: ['id', 'status'],
    });
    expect(listByTag.nodes.length).toBe(1);
    expect(listByTag.nodes[0].id).toBe(n1.id);

    const listByType = await QueryEngine.listNodes({ project, type: 'blocker' });
    expect(listByType.nodes.length).toBe(1);
    expect(listByType.nodes[0].id).toBe(n2.id);

    const listByStatus = await QueryEngine.listNodes({ project, status: 'done' });
    expect(listByStatus.nodes.length).toBe(1);
  });

  it('should test getSubgraph with deep traversal and filters', () => {
    const n1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Root Task',
      status: 'pending',
    });
    const n2 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Child Task',
      status: 'pending',
    });
    const n3 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Dec Node',
      status: 'accepted',
    });
    EdgeEngine.addEdge({ project, source_id: n1.id, target_id: n2.id, type: 'depends_on' });
    EdgeEngine.addEdge({ project, source_id: n2.id, target_id: n3.id, type: 'decided_in' });

    const sub1 = QueryEngine.getSubgraph({
      project,
      root_id: n1.id,
      depth: 3,
      edge_types: ['depends_on', 'decided_in'],
      node_types: ['task', 'decision'],
      fields: ['id', 'title', 'type'],
    });
    expect(sub1.nodes.length).toBe(3);
    expect(sub1.edges.length).toBe(2);
  });

  it('should test importGraph and SynergyEngine', () => {
    const imp = importGraph({
      project,
      nodes: [
        { type: 'task', title: 'Imported 1', status: 'pending' },
        { type: 'task', title: 'Imported 2', status: 'done' },
      ],
      edges: [],
    });
    expect(imp.imported_nodes_count).toBe(2);

    const synergy = SynergyEngine.getSynergyMetrics({ project });
    expect(synergy).toBeDefined();

    const joint = SynergyEngine.exportJointTrajectories({ project });
    expect(joint).toBeDefined();
  });
});
