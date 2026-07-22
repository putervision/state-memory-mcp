import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeAllDbs } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { queryGraph } from '../../src/engine/query-raw.js';

describe('Raw Query Engine (query-raw)', () => {
  const project = 'query-raw-test-project';

  beforeAll(() => {
    closeAllDbs();
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Query Task 1',
      status: 'pending',
    });
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Query Task 2',
      status: 'done',
    });
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should execute SELECT query and return rows', () => {
    const rows = queryGraph({
      project,
      sql: 'SELECT id, type, title, status FROM nodes WHERE project = ? ORDER BY title ASC',
      params: [project],
    });

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect((rows as any[])[0].title).toBe('Query Task 1');
  });

  it('should allow semicolons inside string literals', () => {
    const rows = queryGraph({
      project,
      sql: "SELECT * FROM nodes WHERE title != 'foo;bar' AND project = ?",
      params: [project],
    });
    expect(rows).toBeDefined();
  });

  it('should reject multiple SQL statements', () => {
    expect(() => {
      queryGraph({
        project,
        sql: 'SELECT * FROM nodes; DROP TABLE nodes;',
      });
    }).toThrow();
  });

  it('should reject non-SELECT statements (write security check)', () => {
    expect(() => {
      queryGraph({
        project,
        sql: 'DELETE FROM nodes WHERE project = ?',
        params: [project],
      });
    }).toThrow();
  });
});
