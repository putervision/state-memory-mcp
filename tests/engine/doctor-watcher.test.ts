import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDoctorReport, watchGraphChanges } from '../../src/engine/doctor-watcher.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { getDb, closeDb } from '../../src/engine/db.js';

describe('System Doctor & Graph Health Watcher Engine', () => {
  const project = 'doctor-watcher-test-project';

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

  it('should generate a doctor report with schema version and health status', () => {
    GraphEngine.addNode({ project, type: 'task', title: 'Healthy Task' });

    const report = getDoctorReport({ project });

    expect(report.status).toBe('healthy');
    expect(report.schema_version).toBe(10);
    expect(report.total_nodes).toBe(1);
    expect(report.db_size_bytes).toBeGreaterThan(0);
  });

  it('should observe recent state graph changes with watchGraphChanges', () => {
    const node = GraphEngine.addNode({ project, type: 'task', title: 'Watched Task' });

    const watch = watchGraphChanges({ project });

    expect(watch.changed_events_count).toBeGreaterThan(0);
    expect(watch.events[0].entity_id).toBe(node.id);
  });
});
