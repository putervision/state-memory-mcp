import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';
import { exportGraph } from '../../src/engine/utils.js';

describe('Graph Export Validity Tests', () => {
  const project = 'export-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM nodes').run();

    const n1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Task 1',
      status: 'pending',
    });
    const n2 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Decision 1',
      status: 'proposed',
    });
    EdgeEngine.addEdge({
      project,
      source_id: n1.id,
      target_id: n2.id,
      type: 'depends_on',
    });
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should generate valid JSON export', () => {
    const output = exportGraph({ project, format: 'json' });
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('nodes');
    expect(parsed).toHaveProperty('edges');
    expect(parsed.nodes.length).toBe(2);
    expect(parsed.edges.length).toBe(1);
  });

  it('should generate valid DOT export', () => {
    const output = exportGraph({ project, format: 'dot' });
    expect(output).toContain('digraph G {');
    expect(output).toContain('rankdir=LR;');
    expect(output).toContain('depends_on');
    expect(output).toContain('}');
  });

  it('should generate valid Mermaid export', () => {
    const output = exportGraph({ project, format: 'mermaid' });
    expect(output).toContain('flowchart TD');
    expect(output).toContain('classDef task');
    expect(output).toContain('depends_on');
  });

  it('should generate HTML visualization export', () => {
    const output = exportGraph({ project, format: 'html' });
    expect(output).toContain('<!DOCTYPE html>');
    expect(output).toContain('ForceGraph3D');
    expect(output).toContain('allGraphNodes');
    expect(output).toContain('allGraphLinks');
  });
});
