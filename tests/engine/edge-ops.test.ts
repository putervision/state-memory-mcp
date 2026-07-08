import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';

describe('EdgeEngine Operations & Cycle Detection', () => {
  const project = 'edge-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should successfully add and remove an edge', () => {
    const nodeA = GraphEngine.addNode({ project, type: 'task', title: 'Task A' });
    const nodeB = GraphEngine.addNode({ project, type: 'task', title: 'Task B' });

    const edge = EdgeEngine.addEdge({
      project,
      source_id: nodeA.id,
      target_id: nodeB.id,
      type: 'depends_on',
      properties: { note: 'A depends on B' },
    });

    expect(edge).toBeDefined();
    expect(edge.source_id).toBe(nodeA.id);
    expect(edge.target_id).toBe(nodeB.id);
    expect(edge.type).toBe('depends_on');
    expect(edge.properties.note).toBe('A depends on B');

    // Retrieve node A and verify it has an outbound edge
    const retrievedA = GraphEngine.getNode({ project, id: nodeA.id });
    expect(retrievedA!.outbound_edges!.length).toBe(1);
    expect(retrievedA!.outbound_edges![0].target_id).toBe(nodeB.id);

    // Retrieve node B and verify it has an inbound edge
    const retrievedB = GraphEngine.getNode({ project, id: nodeB.id });
    expect(retrievedB!.inbound_edges!.length).toBe(1);
    expect(retrievedB!.inbound_edges![0].source_id).toBe(nodeA.id);

    // Remove the edge
    const removed = EdgeEngine.removeEdge({
      project,
      source_id: nodeA.id,
      target_id: nodeB.id,
      type: 'depends_on',
    });
    expect(removed).toBe(true);

    const retrievedAfter = GraphEngine.getNode({ project, id: nodeA.id });
    expect(retrievedAfter!.outbound_edges!.length).toBe(0);
  });

  it('should prevent circular dependencies (direct cycle)', () => {
    const nodeA = GraphEngine.addNode({ project, type: 'task', title: 'Task A' });
    const nodeB = GraphEngine.addNode({ project, type: 'task', title: 'Task B' });

    EdgeEngine.addEdge({
      project,
      source_id: nodeA.id,
      target_id: nodeB.id,
      type: 'depends_on',
    });

    // Trying to add B depends_on A should fail
    expect(() => {
      EdgeEngine.addEdge({
        project,
        source_id: nodeB.id,
        target_id: nodeA.id,
        type: 'depends_on',
      });
    }).toThrow(/circular dependency/);
  });

  it('should prevent circular dependencies (transitive cycle)', () => {
    const nodeA = GraphEngine.addNode({ project, type: 'task', title: 'Task A' });
    const nodeB = GraphEngine.addNode({ project, type: 'task', title: 'Task B' });
    const nodeC = GraphEngine.addNode({ project, type: 'task', title: 'Task C' });

    EdgeEngine.addEdge({ project, source_id: nodeA.id, target_id: nodeB.id, type: 'depends_on' });
    EdgeEngine.addEdge({ project, source_id: nodeB.id, target_id: nodeC.id, type: 'depends_on' });

    // Trying to add C depends_on A should fail
    expect(() => {
      EdgeEngine.addEdge({
        project,
        source_id: nodeC.id,
        target_id: nodeA.id,
        type: 'depends_on',
      });
    }).toThrow(/circular dependency/);
  });

  it('should prevent circular dependencies with blocks edges', () => {
    const nodeA = GraphEngine.addNode({ project, type: 'task', title: 'Task A' });
    const nodeB = GraphEngine.addNode({ project, type: 'task', title: 'Task B' });

    // A is blocked by B (B blocks A, which means A depends on B)
    EdgeEngine.addEdge({
      project,
      source_id: nodeB.id,
      target_id: nodeA.id,
      type: 'blocks',
    });

    // Trying to add B depends_on A should fail
    expect(() => {
      EdgeEngine.addEdge({
        project,
        source_id: nodeB.id,
        target_id: nodeA.id,
        type: 'depends_on',
      });
    }).toThrow(/circular dependency/);
  });

  it('should allow cycles for non-dependency edge types', () => {
    const nodeA = GraphEngine.addNode({ project, type: 'task', title: 'Task A' });
    const nodeB = GraphEngine.addNode({ project, type: 'task', title: 'Task B' });

    EdgeEngine.addEdge({ project, source_id: nodeA.id, target_id: nodeB.id, type: 'references' });
    
    // References cycle is fine
    expect(() => {
      EdgeEngine.addEdge({
        project,
        source_id: nodeB.id,
        target_id: nodeA.id,
        type: 'references',
      });
    }).not.toThrow();
  });
});
