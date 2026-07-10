import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { TrajectoryEngine } from '../../src/engine/trajectories.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';

describe('TrajectoryEngine Integration Tests', () => {
  const project = 'trajectory-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM events').run();
    db.prepare('DELETE FROM nodes').run();
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should export events log in JSONL format', () => {
    const node = GraphEngine.addNode({ project, type: 'task', title: 'Task' });
    GraphEngine.updateNode({ project, id: node.id, title: 'Updated' });

    const db = getDb(project);
    const jsonl = TrajectoryEngine.exportTrajectories(db, { project });

    expect(jsonl).toBeDefined();
    const lines = jsonl.split('\n');
    expect(lines.length).toBe(2);

    const first = JSON.parse(lines[0]);
    const second = JSON.parse(lines[1]);

    expect(first.event_type).toBe('node_created');
    expect(first.after_state.title).toBe('Task');

    expect(second.event_type).toBe('node_updated');
    expect(second.before_state.title).toBe('Task');
    expect(second.after_state.title).toBe('Updated');
  });
});
