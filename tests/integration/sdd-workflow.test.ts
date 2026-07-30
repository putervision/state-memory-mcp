import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { specHandlers } from '../../src/handlers/spec.js';
import { analyticsHandlers } from '../../src/handlers/analytics.js';

describe('Spec-Driven Development (SDD) Workflow Integration Tests', () => {
  const project = 'sdd-test-project';

  beforeEach(() => {
    closeDb(project);
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  afterEach(() => {
    closeDb(project);
  });

  it('should scaffold spec nodes and track compliance matrix', () => {
    const scaffoldRes = specHandlers.scaffold_spec({
      project,
      title: 'User Authentication Feature Spec',
    });

    expect(scaffoldRes.spec_path).toBeDefined();
    expect(scaffoldRes.spec_node_id).toBeDefined();

    const complianceBefore = specHandlers.get_spec_compliance({ project });
    expect(complianceBefore.total_specs).toBe(1);
    expect(complianceBefore.total_criteria).toBe(4);

    const firstCrit = complianceBefore.unverified_criteria[0];
    if (firstCrit) {
      const verifyRes = specHandlers.verify_requirement({
        project,
        criterion_id: firstCrit.id,
        status: 'verified',
      });
      expect(verifyRes.criterion_id).toBe(firstCrit.id);
      expect(verifyRes.status).toBe('verified');
    }

    const complianceAfter = specHandlers.get_spec_compliance({ project });
    expect(complianceAfter.verified_criteria_count).toBe(1);
    expect(complianceAfter.verification_percentage).toBeGreaterThan(0);
  });

  it('should execute semantic TF-IDF blocker search via find_similar_blockers', () => {
    GraphEngine.addNode({
      project,
      type: 'observation',
      title: 'Database connection pool timeout under load',
      status: 'active',
    });

    GraphEngine.addNode({
      project,
      type: 'blocker',
      title: 'Redis cache eviction memory exhaustion',
      status: 'active',
    });

    const results = analyticsHandlers.find_similar_blockers({
      project,
      query: 'database pool timeout',
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('Database connection pool');
  });
});
