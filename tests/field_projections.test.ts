import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getDb, closeAllDbs } from '../src/engine/db.js';
import { GraphEngine } from '../src/engine/graph.js';
import { QueryEngine } from '../src/engine/queries.js';
import { EdgeEngine } from '../src/engine/edges.js';

describe('Field Projections Test Suite', () => {
  const project = 'projection-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('listNodes should project only requested fields', async () => {
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Full Node',
      status: 'pending',
      metadata: { secret: 'data' },
      tags: ['t1'],
    });

    const res = await QueryEngine.listNodes({
      project,
      fields: ['id', 'title', 'status'],
    });

    expect(res.nodes.length).toBe(1);
    const n = res.nodes[0] as any;
    expect(n.id).toBeDefined();
    expect(n.title).toBe('Full Node');
    expect(n.status).toBe('pending');
    expect(n.metadata).toBeUndefined();
    expect(n.tags).toBeUndefined();
    expect(n.created_at).toBeUndefined();
  });

  it('searchNodes should project fields when algorithm is fts', async () => {
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Searchable Target Task',
      status: 'pending',
      metadata: { desc: 'some info' },
    });

    const res = await QueryEngine.searchNodes({
      project,
      query: 'Searchable',
      fields: ['id', 'title'],
    });

    expect(res.nodes.length).toBe(1);
    const n = res.nodes[0] as any;
    expect(n.id).toBeDefined();
    expect(n.title).toBe('Searchable Target Task');
    expect(n.status).toBeUndefined();
    expect(n.metadata).toBeUndefined();
  });

  it('getSubgraph should project node fields', async () => {
    const root = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Root Node',
      status: 'in_progress',
      metadata: { key: 'val' },
    });

    const child = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Child Node',
      status: 'pending',
    });

    EdgeEngine.addEdge({
      project,
      source_id: child.id,
      target_id: root.id,
      type: 'child_of',
    });

    const res = QueryEngine.getSubgraph({
      project,
      root_id: root.id,
      depth: 2,
      fields: ['id', 'type', 'title'],
    });

    expect(res.nodes.length).toBeGreaterThanOrEqual(1);
    for (const n of res.nodes as any[]) {
      expect(n.id).toBeDefined();
      expect(n.type).toBeDefined();
      expect(n.title).toBeDefined();
      expect(n.status).toBeUndefined();
      expect(n.metadata).toBeUndefined();
    }
  });
});
