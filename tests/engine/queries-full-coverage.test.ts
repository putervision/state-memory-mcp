import { describe, it, expect, afterAll } from 'vitest';
import { QueryEngine, projectNodeFields } from '../../src/engine/queries.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { closeAllDbs } from '../../src/engine/db.js';

describe('QueryEngine Extended Coverage', () => {
  const project = 'query-cov-ext-project';

  afterAll(() => {
    closeAllDbs();
  });

  it('should test projectNodeFields projection helper', () => {
    const node: any = { id: 'n1', type: 'task', title: 'Task Title', status: 'in_progress' };
    const projected = projectNodeFields(node, ['id', 'title']);
    expect(projected).toEqual({ id: 'n1', title: 'Task Title' });

    expect(projectNodeFields(node, [])).toBe(node);
  });

  it('should list nodes with compact mode, field projection, and tags', async () => {
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Tagged Task',
      tags: ['urgent', 'frontend'],
    });

    const res = await QueryEngine.listNodes({
      project,
      tags: ['urgent'],
      compact: true,
      fields: ['id', 'title'],
      git_branch: '*',
    });

    expect(res.total_count).toBeGreaterThanOrEqual(1);
    expect(res.nodes[0]).toHaveProperty('id');
  });

  it('should get subgraph with node_types and edge_types filtering', () => {
    const n1 = GraphEngine.addNode({ project, type: 'task', title: 'Task A' });
    const n2 = GraphEngine.addNode({ project, type: 'decision', title: 'Decision B' });
    const n3 = GraphEngine.addNode({ project, type: 'blocker', title: 'Blocker C' });

    EdgeEngine.addEdge({ project, source_id: n1.id, target_id: n2.id, type: 'depends_on' });
    EdgeEngine.addEdge({ project, source_id: n3.id, target_id: n1.id, type: 'blocks' });

    const sub1 = QueryEngine.getSubgraph({
      project,
      root_id: n1.id,
      depth: 2,
      node_types: ['task', 'decision'],
      edge_types: ['depends_on'],
    });

    expect(sub1.nodes.length).toBeGreaterThanOrEqual(1);

    // Empty result when node_types filters out all returned nodes
    const emptySub = QueryEngine.getSubgraph({
      project,
      root_id: n1.id,
      depth: 1,
      node_types: ['milestone'],
    });
    expect(emptySub.nodes).toEqual([]);
    expect(emptySub.edges).toEqual([]);

    // Empty result when non-existent root_id throws Error or returns empty
    expect(() =>
      QueryEngine.getSubgraph({
        project,
        root_id: 'non-existent-id',
        depth: 1,
      })
    ).toThrow();
  });

  it('should fall back to TF-IDF when FTS search encounters malformed query syntax', async () => {
    const res = await QueryEngine.searchNodes({
      project,
      query: 'Task AND OR NOT (',
      algorithm: 'fts',
    });
    expect(res).toBeDefined();
    expect(Array.isArray(res.nodes)).toBe(true);
  });
});
