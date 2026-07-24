import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getDb, closeAllDbs } from '../src/engine/db.js';
import { GraphEngine } from '../src/engine/graph.js';
import { validateGraph } from '../src/engine/validate.js';
import { generateId } from '../src/utils/id.js';

describe('Auto-Fix Graph Validation Tests', () => {
  const project = 'autofix-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should detect dangling edges and auto-fix them when auto_fix is true', () => {
    const db = getDb(project);
    const n1 = GraphEngine.addNode({ project, type: 'task', title: 'Task A' });

    // Manually insert a dangling edge referencing a fake target node with PRAGMA foreign_keys = OFF
    db.pragma('foreign_keys = OFF');
    const fakeTargetId = generateId();
    db.prepare(
      `INSERT INTO edges (id, source_id, target_id, type, properties, project, created_at) VALUES (?, ?, ?, ?, '{}', ?, ?)`
    ).run(generateId(), n1.id, fakeTargetId, 'depends_on', project, new Date().toISOString());
    db.pragma('foreign_keys = ON');


    // Dry-run validate
    const dryRun = validateGraph(db, { project, checks: ['dangling_edges'], auto_fix: false });
    expect(dryRun.passed).toBe(false);
    expect(dryRun.issues.length).toBe(1);
    expect(dryRun.fixed_count).toBe(0);

    // Auto-fix run
    const autoFixRun = validateGraph(db, { project, checks: ['dangling_edges'], auto_fix: true });
    expect(autoFixRun.passed).toBe(true);
    expect(autoFixRun.fixed_count).toBe(1);

    // Verify dangling edge was removed
    const remainingEdges = db.prepare('SELECT COUNT(*) as cnt FROM edges WHERE project = ?').get(project) as any;
    expect(remainingEdges.cnt).toBe(0);
  });
});
