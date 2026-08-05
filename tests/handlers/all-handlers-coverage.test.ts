import { describe, it, expect, afterAll } from 'vitest';
import { analyticsHandlers } from '../../src/handlers/analytics.js';
import { graphHandlers } from '../../src/handlers/graph.js';
import { nodeHandlers } from '../../src/handlers/node.js';
import { sessionHandlers } from '../../src/handlers/session.js';
import { parseArgs, findFuzzyNodeSuggestions } from '../../src/handlers/helper.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { closeAllDbs } from '../../src/engine/db.js';

describe('Handler Coverage Complete Suite', () => {
  const project = 'handlers-cov-full-project';

  afterAll(() => {
    closeAllDbs();
  });

  it('should test traceback_to_node for existing and non-existing nodes', () => {
    const task = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Traceback task',
      status: 'pending',
    });

    const resSuccess = analyticsHandlers.traceback_to_node({
      project,
      target_node_id: task.id || (task as any).node?.id,
      reason: 'Downstream test failure',
    });
    expect(resSuccess.success).toBe(true);
    expect(resSuccess.status).toBe('in_progress');

    const resFail = analyticsHandlers.traceback_to_node({
      project,
      target_node_id: 'non-existent-target-id',
    });
    expect(resFail.success).toBe(false);
    expect(resFail.error).toContain('not found');
  });

  it('should test export_graph and import_graph handlers', () => {
    const exported = graphHandlers.export_graph({ project });
    expect(exported).toBeDefined();

    const graphDataStr = JSON.stringify(exported);

    expect(() =>
      graphHandlers.import_graph({
        project,
        graph_data: graphDataStr,
        force: false,
      })
    ).toThrow('Database is not empty');

    const imported = graphHandlers.import_graph({
      project,
      graph_data: graphDataStr,
      force: true,
    });
    expect(imported).toBeDefined();
  });

  it('should throw McpError when remove_node targets a non-existent node ID', () => {
    expect(() =>
      nodeHandlers.remove_node({
        project,
        id: 'non-existent-id-xyz',
      })
    ).toThrow();
  });

  it('should test sessionHandlers list_sessions', () => {
    const res = sessionHandlers.list_sessions({ project, limit: 5 });
    expect(res).toBeDefined();
  });

  it('should test findFuzzyNodeSuggestions when project has no nodes', () => {
    const emptyProj = 'empty-fuzzy-proj-test';
    const msg = findFuzzyNodeSuggestions(emptyProj, 'invalid-id-123');
    expect(msg).toBe(`Node "invalid-id-123" not found in project "${emptyProj}".`);
  });

  it('should handle custom validation errors in parseArgs', () => {
    const dummySchema = {
      safeParse: () => ({
        success: false,
        error: { errors: [] },
      }),
    };
    expect(() => parseArgs(dummySchema as any, {})).toThrow('Unknown validation error');
  });
});
