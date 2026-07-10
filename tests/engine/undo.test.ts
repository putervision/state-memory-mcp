import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { EventEngine } from '../../src/engine/events.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';

describe('Undo Integration Tests', () => {
  const project = 'undo-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM events').run();
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should undo last update on a node', () => {
    const node = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Original Title',
      status: 'pending',
    });

    GraphEngine.updateNode({
      project,
      id: node.id,
      title: 'New Title',
      status: 'in_progress',
    });

    const db = getDb(project);
    const result = EventEngine.undoLast(db, {
      project,
      node_id: node.id,
    });

    expect(result.success).toBe(true);
    expect(result.undone_event_type).toBe('node_updated');

    const restoredNode = GraphEngine.getNode({ project, id: node.id });
    expect(restoredNode).not.toBeNull();
    expect(restoredNode!.node.title).toBe('Original Title');
    expect(restoredNode!.node.status).toBe('pending');
  });

  it('should undo last creation of a node (should delete it)', () => {
    const node = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Shortlived Node',
    });

    const db = getDb(project);
    const result = EventEngine.undoLast(db, {
      project,
      node_id: node.id,
    });

    expect(result.success).toBe(true);
    expect(result.undone_event_type).toBe('node_created');

    const restoredNode = GraphEngine.getNode({ project, id: node.id });
    expect(restoredNode).toBeNull();
  });

  it('should undo last deletion of a node (should restore it)', () => {
    const node = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Deleted and Back',
      status: 'done',
    });

    GraphEngine.removeNode({ project, id: node.id });

    const db = getDb(project);
    const result = EventEngine.undoLast(db, {
      project,
      node_id: node.id,
    });

    expect(result.success).toBe(true);
    expect(result.undone_event_type).toBe('node_deleted');

    const restoredNode = GraphEngine.getNode({ project, id: node.id });
    expect(restoredNode).not.toBeNull();
    expect(restoredNode!.node.title).toBe('Deleted and Back');
    expect(restoredNode!.node.status).toBe('done');
  });
});
