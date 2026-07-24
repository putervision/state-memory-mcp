import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getDb, closeAllDbs } from '../src/engine/db.js';
import { GraphEngine } from '../src/engine/graph.js';
import { nodeHandlers } from '../src/handlers/node.js';

describe('Fuzzy Node ID Suggestion Error Tests', () => {
  const project = 'fuzzy-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should include recent node suggestions when get_node receives an invalid ID', () => {
    const n = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Recent Active Task',
      status: 'in_progress',
    });

    try {
      nodeHandlers.get_node({ project, id: 'INVALID_ID_999' });
      expect.fail('Expected McpError to be thrown');
    } catch (err: any) {
      expect(err.message).toContain('Node "INVALID_ID_999" not found');
      expect(err.message).toContain('Did you mean one of these recent nodes?');
      expect(err.message).toContain('Recent Active Task');
      expect(err.message).toContain(n.id);
    }
  });

  it('should include recent node suggestions when update_node receives an invalid ID', () => {
    GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Recent Decision',
      status: 'accepted',
    });

    try {
      nodeHandlers.update_node({ project, id: 'INVALID_ID_888', title: 'New' });
      expect.fail('Expected McpError to be thrown');
    } catch (err: any) {
      expect(err.message).toContain('Node "INVALID_ID_888" not found');
      expect(err.message).toContain('Recent Decision');
    }
  });
});
