import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { EventEngine } from '../../src/engine/events.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';

describe('EventEngine Integration Tests', () => {
  const project = 'event-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM events').run();
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should log node creation event automatically', () => {
    const node = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Test Node Event',
    });

    const db = getDb(project);
    const events = EventEngine.getEventLog(db, { project });
    expect(events.length).toBe(1);
    expect(events[0].event_type).toBe('node_created');
    expect(events[0].entity_id).toBe(node.id);
    expect(events[0].entity_type).toBe('node');
    expect(events[0].before_state).toBeNull();
    expect(events[0].after_state).toBeDefined();

    const afterNode = JSON.parse(events[0].after_state!);
    expect(afterNode.title).toBe('Test Node Event');
  });

  it('should log node update events with before/after state', () => {
    const node = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Initial Title',
      status: 'pending',
    });

    GraphEngine.updateNode({
      project,
      id: node.id,
      title: 'Updated Title',
      status: 'in_progress',
    });

    const db = getDb(project);
    const events = EventEngine.getEventLog(db, { project });
    expect(events.length).toBe(2);

    // Most recent is update
    expect(events[0].event_type).toBe('node_updated');
    expect(events[0].entity_id).toBe(node.id);
    expect(events[0].before_state).toBeDefined();
    expect(events[0].after_state).toBeDefined();

    const before = JSON.parse(events[0].before_state!);
    const after = JSON.parse(events[0].after_state!);
    expect(before.title).toBe('Initial Title');
    expect(before.status).toBe('pending');
    expect(after.title).toBe('Updated Title');
    expect(after.status).toBe('in_progress');
  });

  it('should log node deletion events', () => {
    const node = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Temp Node',
    });

    GraphEngine.removeNode({
      project,
      id: node.id,
    });

    const db = getDb(project);
    const events = EventEngine.getEventLog(db, { project });
    expect(events.length).toBe(2);
    expect(events[0].event_type).toBe('node_deleted');
    expect(events[0].entity_id).toBe(node.id);
    expect(events[0].before_state).toBeDefined();
    expect(events[0].after_state).toBeNull();

    const before = JSON.parse(events[0].before_state!);
    expect(before.title).toBe('Temp Node');
  });

  it('should log edge creation and deletion events', () => {
    const nodeA = GraphEngine.addNode({ project, type: 'task', title: 'Node A' });
    const nodeB = GraphEngine.addNode({ project, type: 'task', title: 'Node B' });

    const edge = EdgeEngine.addEdge({
      project,
      source_id: nodeA.id,
      target_id: nodeB.id,
      type: 'depends_on',
    });

    const db = getDb(project);
    let events = EventEngine.getEventLog(db, { project });
    // 2 node creations + 1 edge creation
    expect(events.length).toBe(3);
    expect(events[0].event_type).toBe('edge_created');
    expect(events[0].entity_id).toBe(edge.id);
    expect(events[0].entity_type).toBe('edge');

    EdgeEngine.removeEdge({
      project,
      source_id: nodeA.id,
      target_id: nodeB.id,
      type: 'depends_on',
    });

    events = EventEngine.getEventLog(db, { project });
    expect(events.length).toBe(4);
    expect(events[0].event_type).toBe('edge_deleted');
    expect(events[0].entity_id).toBe(edge.id);
    expect(events[0].before_state).toBeDefined();
  });
});
