import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeAllDbs } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { auditProjectDb, findCycles } from '../../src/engine/audit.js';

describe('Audit Engine', () => {
  const project = 'audit-test-project';

  beforeAll(() => {
    closeAllDbs();
    const node1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Audit Task 1',
      status: 'pending',
    });
    const node2 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Audit Task 2',
      status: 'pending',
    });

    EdgeEngine.addEdge({
      project,
      source_id: node1.id,
      target_id: node2.id,
      type: 'depends_on',
    });
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should audit database integrity without errors on a clean graph', () => {
    const report = auditProjectDb({ project });
    expect(report.project).toBe('audit-test-project');
    expect(report.sqlite_integrity).toContain('ok');
    expect(report.orphaned_edges_count).toBe(0);
    expect(report.cycles).toHaveLength(0);
  });

  it('should detect cycles using Tarjan DFS in findCycles helper', () => {
    const nodes = [
      {
        id: 'A',
        type: 'task' as const,
        title: 'A',
        status: 'pending',
        project: 'p',
        git_branch: 'main',
        metadata: {},
        tags: [],
        created_at: '',
        updated_at: '',
      },
      {
        id: 'B',
        type: 'task' as const,
        title: 'B',
        status: 'pending',
        project: 'p',
        git_branch: 'main',
        metadata: {},
        tags: [],
        created_at: '',
        updated_at: '',
      },
    ];
    const edges = [
      {
        id: 'e1',
        source_id: 'A',
        target_id: 'B',
        type: 'depends_on' as const,
        properties: {},
        project: 'p',
        git_branch: 'main',
        created_at: '',
      },
      {
        id: 'e2',
        source_id: 'B',
        target_id: 'A',
        type: 'depends_on' as const,
        properties: {},
        project: 'p',
        git_branch: 'main',
        created_at: '',
      },
    ];

    const cycles = findCycles(nodes, edges);
    expect(cycles.length).toBeGreaterThan(0);
  });
});
