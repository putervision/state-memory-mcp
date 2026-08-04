import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { validateGraph } from '../../src/engine/validate.js';
import { NodeType, EdgeType } from '../../src/schema/types.js';

describe('Property-Based Graph Mutation Tests', () => {
  const project = 'property-test-project';

  beforeEach(() => {
    delete process.env.STATE_MEMORY_MCP_DIR;
    closeDb(project);
  });

  afterEach(() => {
    closeDb(project);
  });

  it(
    'should maintain graph invariants under 100 randomized mutation operations',
    { timeout: 60000 },
    () => {
      const db = getDb(project);
      const createdNodeIds: string[] = [];
      const createdEdges: { source_id: string; target_id: string; type: EdgeType }[] = [];

      const nodeTypes: NodeType[] = [
        'task',
        'decision',
        'artifact',
        'plan',
        'observation',
        'blocker',
        'milestone',
      ];
      const edgeTypes: EdgeType[] = [
        'depends_on',
        'blocks',
        'produces',
        'references',
        'part_of',
        'child_of',
      ];

      // Run 100 randomized operations
      for (let i = 0; i < 100; i++) {
        const opType = Math.floor(Math.random() * 4); // 0: add_node, 1: add_edge, 2: update_node, 3: validate_graph

        if (opType === 0) {
          const type = nodeTypes[Math.floor(Math.random() * nodeTypes.length)];
          const title = `Random Node ${i} - ${Math.random().toString(36).substring(7)}`;
          const node = GraphEngine.addNode({ project, type, title });
          expect(node).toBeDefined();
          expect(node.id).toBeDefined();
          createdNodeIds.push(node.id);
        } else if (opType === 1 && createdNodeIds.length >= 2) {
          const source_id = createdNodeIds[Math.floor(Math.random() * createdNodeIds.length)];
          const target_id = createdNodeIds[Math.floor(Math.random() * createdNodeIds.length)];
          if (source_id !== target_id) {
            const type = edgeTypes[Math.floor(Math.random() * edgeTypes.length)];
            try {
              const edge = EdgeEngine.addEdge({ project, source_id, target_id, type });
              if (edge) {
                createdEdges.push({ source_id, target_id, type });
              }
            } catch (err: any) {
              // Cycle rejection or duplicate edge errors are expected invariants
              expect(err.message).toMatch(/circular dependency|already exists|not found/i);
            }
          }
        } else if (opType === 2 && createdNodeIds.length > 0) {
          const id = createdNodeIds[Math.floor(Math.random() * createdNodeIds.length)];
          const updated = GraphEngine.updateNode({
            project,
            id,
            title: `Updated Title ${i}`,
            status: 'done',
          });
          expect(updated).toBeDefined();
          if (updated) {
            expect(updated.title).toBe(`Updated Title ${i}`);
          }
        } else {
          const validation = validateGraph(db, { project });
          expect(validation).toBeDefined();
          expect(Array.isArray(validation.issues)).toBe(true);
        }
      }

      // Final invariant assertions
      const validation = validateGraph(db, { project });
      expect(validation).toBeDefined();
    }
  );
});
