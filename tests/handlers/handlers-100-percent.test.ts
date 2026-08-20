import { describe, it, expect, afterAll } from 'vitest';
import { edgeHandlers } from '../../src/handlers/edge.js';
import { specHandlers } from '../../src/handlers/spec.js';
import { sessionHandlers } from '../../src/handlers/session.js';
import { analyticsHandlers } from '../../src/handlers/analytics.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { closeAllDbs } from '../../src/engine/db.js';

describe('100% Handler Coverage Suite', () => {
  const project = 'handlers-100-pct-project';

  afterAll(() => {
    closeAllDbs();
  });

  it('should throw McpError when remove_edge target edge is not found', () => {
    expect(() =>
      edgeHandlers.manage_edges({
        action: 'remove',
        project,
        source_id: 'n1',
        target_id: 'n2',
        type: 'depends_on',
      })
    ).toThrow('Edge not found');
  });

  it('should test verify_requirement with observation_id in specHandlers', () => {
    const criterion = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Requirement Criterion A',
      status: 'pending',
    });

    const obs = GraphEngine.addNode({
      project,
      type: 'observation',
      title: 'Observation Proof A',
      status: 'active',
    });

    const critId = criterion.id || (criterion as any).node?.id;
    const obsId = obs.id || (obs as any).node?.id;

    const res: any = specHandlers.manage_specs({
      action: 'verify',
      project,
      criterion_id: critId,
      observation_id: obsId,
      status: 'verified',
    });

    expect(res).toBeDefined();
    expect(res.observation_id).toBe(obsId);
  });

  it('should throw McpError when what_changed receives no since or since_session', () => {
    expect(() =>
      sessionHandlers.get_events({
        action: 'changelog',
        project,
      })
    ).toThrow('Either since or since_session parameter must be provided');
  });

  it('should run get_cognitive_load in analyticsHandlers', () => {
    const res: any = analyticsHandlers.get_analytics({ action: 'cognitive_load', project });
    expect(res).toBeDefined();
    expect(res.project).toBe(project);
    expect(typeof res.metrics.total_cognitive_load_CL).toBe('number');
  });

  it('should run specHandlers scaffold and compliance', () => {
    const scaffoldRes: any = specHandlers.manage_specs({
      action: 'scaffold',
      project,
      title: 'Scaffolded Feature Spec',
    });
    expect(scaffoldRes).toBeDefined();

    const complianceRes: any = specHandlers.manage_specs({ action: 'compliance', project });
    expect(complianceRes).toBeDefined();
  });
});
