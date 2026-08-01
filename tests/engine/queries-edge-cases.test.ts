import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { QueryEngine, projectNodeFields } from '../../src/engine/queries.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { getDb, closeAllDbs } from '../../src/engine/db.js';

describe('Query Engine Edge Cases & Field Projections', () => {
  const project = 'queries-edge-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should project specific node fields correctly', () => {
    const fullNode: any = {
      id: 'node-1',
      type: 'task',
      title: 'Full Task',
      status: 'pending',
      metadata: { secret: 'data' },
      tags: ['a', 'b'],
    };

    const projected = projectNodeFields(fullNode, ['id', 'title']);
    expect(projected).toEqual({ id: 'node-1', title: 'Full Task' });

    expect(projectNodeFields(fullNode, [])).toBe(fullNode);
    expect(projectNodeFields(fullNode, undefined)).toBe(fullNode);
  });

  it('should list nodes with multiple tag AND matches', async () => {
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Matching Both Tags',
      tags: ['frontend', 'urgent'],
    });

    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Matching One Tag',
      tags: ['frontend'],
    });

    const resultBoth = await QueryEngine.listNodes({
      project,
      tags: ['frontend', 'urgent'],
      git_branch: '*',
    });
    expect(resultBoth.nodes.length).toBe(1);
    expect(resultBoth.nodes[0].title).toBe('Matching Both Tags');

    const resultOne = await QueryEngine.listNodes({
      project,
      tags: ['frontend'],
      git_branch: '*',
    });
    expect(resultOne.nodes.length).toBe(2);
  });

  it('should support compact mode and field projections in listNodes', async () => {
    GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Decision Projection',
      metadata: { detailed: 'info' },
    });

    const res = await QueryEngine.listNodes({
      project,
      compact: true,
      fields: ['id', 'type', 'title'],
      git_branch: '*',
    });

    expect(res.nodes.length).toBe(1);
    expect(res.nodes[0].id).toBeDefined();
    expect(res.nodes[0].title).toBe('Decision Projection');
    expect((res.nodes[0] as any).metadata).toBeUndefined();
  });
});
