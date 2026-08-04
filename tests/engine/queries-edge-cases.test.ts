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

  it('should handle FTS search query term sanitization on complex or quote-heavy terms', async () => {
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Quoted "Term" Search Test',
    });

    const res = await QueryEngine.searchNodes({
      project,
      query: 'Quoted "Term"',
      git_branch: '*',
    });
    expect(res.nodes.length).toBeGreaterThan(0);
  });

  it('should support TF-IDF search algorithm fallback', async () => {
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'TFIDF Keyword Matching Test',
      tags: ['tfidf-test'],
    });

    const res = await QueryEngine.searchNodes({
      project,
      query: 'Keyword Matching',
      algorithm: 'tfidf',
      git_branch: '*',
    });
    expect(res.nodes.length).toBeGreaterThan(0);
  });

  it('should list nodes with include_subdirectories option', async () => {
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Root Workspace Task',
    });

    const res = await QueryEngine.listNodes({
      project,
      include_subdirectories: true,
      git_branch: '*',
    });
    expect(res.nodes.length).toBeGreaterThan(0);
  });
});
