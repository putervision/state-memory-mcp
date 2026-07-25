import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { QueryEngine } from '../../src/engine/queries.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';

describe('QueryEngine Operations', () => {
  const project = 'query-test-project';
  let nodeIds: string[] = [];

  beforeAll(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();

    // Setup some nodes
    const n1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Database Schema Implementation',
      status: 'done',
      metadata: { priority: 'high', estimate: '3h' },
      tags: ['database', 'schema', 'milestone-1'],
    });

    const n2 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'API Authentication Routes',
      status: 'in_progress',
      metadata: { priority: 'critical', estimate: '5h' },
      tags: ['security', 'api', 'milestone-1'],
    });

    const n3 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Use ULID for Node IDs',
      status: 'accepted',
      metadata: { rationale: 'Sortable, unique, client-side generation' },
      tags: ['architecture', 'database'],
    });

    nodeIds = [n1.id, n2.id, n3.id];

    // Add some edges
    EdgeEngine.addEdge({
      project,
      source_id: n2.id,
      target_id: n1.id,
      type: 'depends_on',
    });

    EdgeEngine.addEdge({
      project,
      source_id: n1.id,
      target_id: n3.id,
      type: 'decided_in',
    });
  });

  afterAll(() => {
    closeAllDbs();
  });

  describe('listNodes', () => {
    it('should filter by node type', async () => {
      const result = await QueryEngine.listNodes({ project, type: 'decision' });
      expect(result.total_count).toBe(1);
      expect(result.nodes[0].type).toBe('decision');
      expect(result.nodes[0].title).toBe('Use ULID for Node IDs');
    });

    it('should filter by node status', async () => {
      const result = await QueryEngine.listNodes({ project, status: 'done' });
      expect(result.total_count).toBe(1);
      expect(result.nodes[0].title).toBe('Database Schema Implementation');
    });

    it('should filter by multiple tags (AND query)', async () => {
      const result = await QueryEngine.listNodes({ project, tags: ['database', 'schema'] });
      expect(result.total_count).toBe(1);
      expect(result.nodes[0].title).toBe('Database Schema Implementation');

      const result2 = await QueryEngine.listNodes({ project, tags: ['database', 'architecture'] });
      expect(result2.total_count).toBe(1);
      expect(result2.nodes[0].type).toBe('decision');
    });

    it('should support pagination (limit/offset)', async () => {
      const result = await QueryEngine.listNodes({ project, limit: 1, offset: 1 });
      expect(result.nodes.length).toBe(1);
      expect(result.total_count).toBe(3);
    });

    it('should respect compact mode (metadata empty)', async () => {
      const result = await QueryEngine.listNodes({ project, compact: true, type: 'task' });
      expect(result.nodes.length).toBe(2);
      expect(result.nodes[0].metadata).toEqual({});
    });
  });

  describe('searchNodes (FTS5)', () => {
    it('should match keywords in title', async () => {
      const result = await QueryEngine.searchNodes({ project, query: 'Authentication' });
      expect(result.total_count).toBe(1);
      expect(result.nodes[0].title).toBe('API Authentication Routes');
    });

    it('should match keywords in metadata rationale', async () => {
      const result = await QueryEngine.searchNodes({ project, query: 'Sortable' });
      expect(result.total_count).toBe(1);
      expect(result.nodes[0].title).toBe('Use ULID for Node IDs');
    });

    it('should update FTS index automatically via triggers on node update', async () => {
      // Find node 2
      const list = await QueryEngine.listNodes({ project, type: 'task' });
      const nodeToUpdate = list.nodes.find((n) => n.title.includes('Authentication'))!;

      GraphEngine.updateNode({
        project,
        id: nodeToUpdate.id,
        title: 'API Authentication and JWT Routes',
      });

      // Search for updated keyword
      const result = await QueryEngine.searchNodes({ project, query: 'JWT' });
      expect(result.total_count).toBe(1);
      expect(result.nodes[0].title).toBe('API Authentication and JWT Routes');
    });

    it('should safely handle queries with colons and special characters without crashing', async () => {
      const result = await QueryEngine.searchNodes({ project, query: 'fix: authentication & jwt' });
      expect(result).toBeDefined();
      expect(Array.isArray(result.nodes)).toBe(true);
    });
  });

  describe('getSubgraph', () => {
    it('should retrieve a node and its N-hop neighbors', async () => {
      // API auth routes (node 2) depends_on Database schema (node 1) decided_in Use ULID (node 3)
      const list = await QueryEngine.listNodes({ project, type: 'task' });
      const node1 = list.nodes.find((n) => n.title.includes('Schema'))!;
      const node2 = list.nodes.find((n) => n.title.includes('Authentication'))!;
      const node3 = (await QueryEngine.listNodes({ project, type: 'decision' })).nodes[0];

      // Get 1-hop subgraph of node 1
      // Should include node 1 itself, node 2 (depends_on node 1), and node 3 (node 1 decided_in node 3)
      const sub = QueryEngine.getSubgraph({
        project,
        root_id: node1.id,
        depth: 1,
      });

      expect(sub.nodes.length).toBe(3);
      expect(sub.edges.length).toBe(2);

      const nodeIds = sub.nodes.map((n) => n.id);
      expect(nodeIds).toContain(node1.id);
      expect(nodeIds).toContain(node2.id);
      expect(nodeIds).toContain(node3.id);
    });
  });
});
