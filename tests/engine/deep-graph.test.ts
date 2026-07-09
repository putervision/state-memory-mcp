import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine, hasCycle } from '../../src/engine/edges.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';

describe('Deep Graph CTE and Concurrency Tests', () => {
  const project = 'deep-graph-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should support deep graph CTE traversal (100+ hops) without stack overflow or performance degradation', () => {
    const db = getDb(project);
    const nodeIds: string[] = [];

    // Create 105 sequential nodes
    for (let i = 0; i < 105; i++) {
      const node = GraphEngine.addNode({
        project,
        type: 'task',
        title: `Node ${i}`,
        status: 'pending',
      });
      nodeIds.push(node.id);
    }

    // Connect them in a long chain: node_0 -> node_1 -> node_2 ... -> node_104
    for (let i = 0; i < nodeIds.length - 1; i++) {
      EdgeEngine.addEdge({
        project,
        source_id: nodeIds[i],
        target_id: nodeIds[i + 1],
        type: 'depends_on',
      });
    }

    // Run cycle detection (which uses recursive CTE) from start of chain to end of chain
    // Adding target -> source should trigger cycle detection targetIds[104] -> sourceIds[0]
    const startTime = Date.now();
    const cycleDetected = hasCycle(db, nodeIds[nodeIds.length - 1], nodeIds[0], 'depends_on');
    const duration = Date.now() - startTime;

    expect(cycleDetected).toBe(true);
    expect(duration).toBeLessThan(100); // Should execute extremely quickly
  });

  it('should handle concurrent read and write operations gracefully using WAL mode', async () => {
    // Perform multiple read/write actions concurrently
    const promises: Promise<any>[] = [];
    
    // Launch 20 concurrent inserts
    for (let i = 0; i < 20; i++) {
      promises.push(
        new Promise<void>((resolve) => {
          setTimeout(() => {
            GraphEngine.addNode({
              project,
              type: 'task',
              title: `Concurrent Node ${i}`,
              status: 'pending',
            });
            resolve();
          }, Math.random() * 20);
        })
      );
    }

    // Launch 20 concurrent queries
    const db = getDb(project);
    for (let i = 0; i < 20; i++) {
      promises.push(
        new Promise<void>((resolve) => {
          setTimeout(() => {
            db.prepare('SELECT COUNT(*) as count FROM nodes').get();
            resolve();
          }, Math.random() * 20);
        })
      );
    }

    await Promise.all(promises);

    const finalCount = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
    expect(finalCount.count).toBe(20);
  });
});
