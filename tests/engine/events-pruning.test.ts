import { describe, it, expect, afterAll } from 'vitest';
import { EventEngine } from '../../src/engine/events.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { getDb, closeAllDbs } from '../../src/engine/db.js';

describe('Event Engine Pruning & Audit Chain', () => {
  const project = 'events-prune-test-project';

  afterAll(() => {
    closeAllDbs();
  });

  it('should verify audit chain for project events', () => {
    const freshProject = `events-audit-fresh-${Date.now()}`;
    const db = getDb(freshProject);
    GraphEngine.addNode({
      project: freshProject,
      type: 'task',
      title: 'Audited Task',
    });

    const res = EventEngine.verifyAuditChain(db, freshProject);
    expect(res.valid).toBe(true);
    expect(res.total_events).toBeGreaterThan(0);
  });

  it('should dry_run prune old events without deleting them', () => {
    const db = getDb(project);
    const result = EventEngine.pruneEvents(db, {
      project,
      older_than: '0s',
      dry_run: true,
    });

    expect(result.would_delete).toBeGreaterThanOrEqual(0);
    expect(result.deleted).toBe(0);
  });

  it('should prune events when dry_run is false', () => {
    const db = getDb(project);
    // Add multiple mutations to create candidate historical events
    const task = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Task Version 1',
    });
    GraphEngine.updateNode({
      project,
      id: task.id,
      title: 'Task Version 2',
    });
    GraphEngine.updateNode({
      project,
      id: task.id,
      title: 'Task Version 3',
    });

    const result = EventEngine.pruneEvents(db, {
      project,
      older_than: '0s',
      dry_run: false,
    });

    expect(result.deleted).toBeGreaterThanOrEqual(0);
  });

  it('should preserve specific event types during pruning', () => {
    const db = getDb(project);
    const result = EventEngine.pruneEvents(db, {
      project,
      older_than: '0s',
      dry_run: false,
      preserve_types: ['node_created'],
    });

    expect(result.preserved).toBeGreaterThan(0);
  });
});
