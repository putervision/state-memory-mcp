import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getStateAtTimestamp, revertToTimestamp } from '../../src/engine/time-travel.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { getDb, closeDb } from '../../src/engine/db.js';

describe('Time Travel State & Trajectory History Explorer', () => {
  const project = 'time-travel-test-project';

  beforeEach(() => {
    closeDb(project);
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
    db.prepare('DELETE FROM events WHERE project = ?').run(project);
  });

  afterEach(() => {
    closeDb(project);
  });

  it('should query historical state memory as of a specific timestamp', async () => {
    const node1 = GraphEngine.addNode({ project, type: 'task', title: 'Task 1 Past' });

    // Store timestamp after node1
    const pastTimestamp = new Date().toISOString();

    // Sleep 20ms then add node2
    await new Promise((r) => setTimeout(r, 20));
    const node2 = GraphEngine.addNode({ project, type: 'task', title: 'Task 2 Future' });

    const pastState = getStateAtTimestamp({ project, timestamp: pastTimestamp });
    expect(pastState.nodes_count).toBe(1);
    expect(pastState.nodes[0].id).toBe(node1.id);
  });

  it('should revert state graph memory to a historical point in time', async () => {
    const node1 = GraphEngine.addNode({ project, type: 'task', title: 'Initial Node' });
    const pastTimestamp = new Date().toISOString();

    await new Promise((r) => setTimeout(r, 20));
    const node2 = GraphEngine.addNode({ project, type: 'task', title: 'Ephemeral Node' });
    EdgeEngine.addEdge({ project, source_id: node2.id, target_id: node1.id, type: 'depends_on' });

    const res = revertToTimestamp({ project, timestamp: pastTimestamp });
    expect(res.removed_nodes_count).toBe(1);
    expect(res.removed_edges_count).toBe(1);

    const currentNode1 = GraphEngine.getNode({ project, id: node1.id });
    const currentNode2 = GraphEngine.getNode({ project, id: node2.id });
    expect(currentNode1).toBeDefined();
    expect(currentNode2).toBeNull();
  });
});
