import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { exportGraph, importGraph, queryGraph } from '../../src/engine/utils.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';

describe('Utility Operations', () => {
  const project = 'util-test-project';
  let t1Id: string;
  let t2Id: string;

  beforeAll(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();

    const t1 = GraphEngine.addNode({ project, type: 'task', title: 'Task 1' });
    const t2 = GraphEngine.addNode({ project, type: 'task', title: 'Task 2' });
    
    t1Id = t1.id;
    t2Id = t2.id;

    EdgeEngine.addEdge({ project, source_id: t1.id, target_id: t2.id, type: 'depends_on' });
  });

  afterAll(() => {
    closeAllDbs();
  });

  describe('exportGraph and importGraph', () => {
    it('should export graph in JSON, DOT, Mermaid, and HTML formats', () => {
      const json = exportGraph({ project, format: 'json' });
      const parsed = JSON.parse(json);
      expect(parsed.nodes.length).toBe(2);
      expect(parsed.edges.length).toBe(1);

      const dot = exportGraph({ project, format: 'dot' });
      expect(dot).toContain('digraph G');
      expect(dot).toContain(`"${t1Id}"`);

      const mermaid = exportGraph({ project, format: 'mermaid' });
      expect(mermaid).toContain('flowchart TD');
      expect(mermaid).toContain(`${t1Id} -->|depends_on| ${t2Id}`);

      const html = exportGraph({ project, format: 'html' });
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('ForceGraph3D');
    });

    it('should import graph data from JSON bulk data correctly', () => {
      const importProject = 'import-test-project';
      
      const importData = {
        nodes: [
          { id: 'N1', type: 'task', title: 'Imported Task 1', status: 'pending', git_branch: 'main', metadata: { priority: 'low' }, tags: ['import'] },
          { id: 'N2', type: 'decision', title: 'Imported Decision', status: 'accepted', git_branch: 'main', metadata: { rationale: 'Import' }, tags: [] }
        ],
        edges: [
          { id: 'E1', source_id: 'N1', target_id: 'N2', type: 'decided_in', git_branch: 'main', properties: {} }
        ]
      };

      const summary = importGraph({
        project: importProject,
        nodes: importData.nodes,
        edges: importData.edges
      });

      expect(summary.imported_nodes_count).toBe(2);
      expect(summary.imported_edges_count).toBe(1);

      const fetchedNode = GraphEngine.getNode({ project: importProject, id: 'N1' });
      expect(fetchedNode).not.toBeNull();
      expect(fetchedNode!.node.title).toBe('Imported Task 1');
      expect(fetchedNode!.node.metadata.priority).toBe('low');
      expect(fetchedNode!.outbound_edges!.length).toBe(1);
    });
  });

  describe('queryGraph (safe raw SQL)', () => {
    it('should safely execute SELECT queries and return rows', () => {
      const rows = queryGraph({
        project,
        sql: 'SELECT id, type, title FROM nodes WHERE project = ? ORDER BY title ASC',
        params: [project]
      });

      expect(rows.length).toBe(2);
      expect(rows[0].title).toBe('Task 1');
      expect(rows[1].title).toBe('Task 2');
    });

    it('should reject non-reader queries (write attempts)', () => {
      expect(() => {
        queryGraph({
          project,
          sql: "INSERT INTO nodes (id, type, title, status, project, created_at, updated_at) VALUES ('X', 'task', 'Hacker', 'pending', ?, 'now', 'now')",
          params: [project]
        });
      }).toThrow(/strictly prohibited/);
    });
  });
});
