import { describe, it, expect, afterAll } from 'vitest';
import { snapshotHandlers } from '../../src/handlers/snapshot.js';
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

  it('should test node reset via manage_nodes update', () => {
    const task = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Traceback task',
      status: 'pending',
    });

    const resSuccess = nodeHandlers.manage_nodes({
      action: 'update',
      project,
      id: task.id || (task as any).node?.id,
      status: 'in_progress',
    });
    expect(resSuccess).toBeDefined();
    expect((resSuccess as any).status).toBe('in_progress');

    expect(() =>
      nodeHandlers.manage_nodes({
        action: 'update',
        project,
        id: 'non-existent-target-id',
        status: 'in_progress',
      })
    ).toThrow();
  });

  it('should test manage_data export_graph and import_graph handlers', async () => {
    const exported: any = await snapshotHandlers.manage_data({ action: 'export_graph', project });
    expect(exported).toBeDefined();

    await expect(
      snapshotHandlers.manage_data({
        action: 'import_graph',
        project,
        nodes: exported.nodes || [],
        edges: exported.edges || [],
        force: false,
      })
    ).rejects.toThrow('Database is not empty');

    const imported: any = await snapshotHandlers.manage_data({
      action: 'import_graph',
      project,
      nodes: exported.nodes || [],
      edges: exported.edges || [],
      force: true,
    });
    expect(imported).toBeDefined();
  });

  it('should throw McpError when remove_node targets a non-existent node ID', () => {
    expect(() =>
      nodeHandlers.manage_nodes({
        action: 'remove',
        project,
        id: 'non-existent-id-xyz',
      })
    ).toThrow();
  });

  it('should test sessionHandlers list_sessions', () => {
    const res = sessionHandlers.manage_sessions({ action: 'list', project, limit: 5 });
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
