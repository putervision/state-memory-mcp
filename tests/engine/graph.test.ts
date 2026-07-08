import { describe, it, expect, afterAll } from 'vitest';
import { GraphEngine } from '../../src/engine/graph.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';
import { beforeEach } from 'vitest';

describe('GraphEngine Node Operations', () => {
  const project = 'test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should successfully add and retrieve a node', () => {
    const node = GraphEngine.addNode({
      project: 'test-project',
      type: 'task',
      title: 'Verify Vitest setup',
      status: 'pending',
      metadata: { priority: 'high' },
      tags: ['test'],
    });

    expect(node).toBeDefined();
    expect(node.id).toBeDefined();
    expect(node.title).toBe('Verify Vitest setup');
    expect(node.status).toBe('pending');
    expect(node.project).toBe('test-project');

    const result = GraphEngine.getNode({
      project: 'test-project',
      id: node.id,
    });

    expect(result).not.toBeNull();
    expect(result!.node.id).toBe(node.id);
    expect(result!.node.title).toBe('Verify Vitest setup');
    expect(result!.node.metadata.priority).toBe('high');
    expect(result!.node.tags).toContain('test');
  });

  it('should handle non-existent node gracefully', () => {
    const result = GraphEngine.getNode({
      project: 'test-project',
      id: 'NON_EXISTENT_ID',
    });
    expect(result).toBeNull();
  });
});
