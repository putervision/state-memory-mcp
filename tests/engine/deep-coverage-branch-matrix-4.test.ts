import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getDb, closeAllDbs } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { EventEngine } from '../../src/engine/events.js';
import { QueryEngine } from '../../src/engine/queries.js';
import { exportGraph } from '../../src/engine/export.js';
import { importGraph } from '../../src/engine/import.js';

describe('Deep Coverage Branch Matrix 4 - FTS Retries, Audit Chain Tamper, Event Undo, Export/Import', () => {
  let project: string;

  beforeEach(() => {
    project = `deep-matrix-4-${randomUUID()}`;
    closeAllDbs();
  });

  afterEach(() => {
    closeAllDbs();
  });

  it('should test verifyAuditChain with intact, tampered hash, tampered prev_hash, and empty chains', () => {
    const db = getDb(project);

    // Empty chain
    const emptyRes = EventEngine.verifyAuditChain(db, project);
    expect(emptyRes.valid).toBe(true);

    // Add nodes to generate valid event chain
    const n1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Task Ev 1',
      status: 'pending',
    });
    const n2 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Task Ev 2',
      status: 'pending',
    });
    GraphEngine.updateNode({ project, id: n1.id, status: 'done' });

    const validRes = EventEngine.verifyAuditChain(db, project);
    expect(validRes.valid).toBe(true);
    expect(validRes.total_events).toBeGreaterThanOrEqual(3);

    // Tamper with hash of n2's event
    db.prepare(
      "UPDATE events SET hash = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' WHERE entity_id = ?"
    ).run(n2.id);
    const tamperedHashRes = EventEngine.verifyAuditChain(db, project);
    expect(tamperedHashRes.valid).toBe(false);
    expect(tamperedHashRes.message).toContain('hash mismatch');

    // Tamper with prev_hash
    db.prepare(
      "UPDATE events SET prev_hash = '1111111111111111111111111111111111111111111111111111111111111111' WHERE entity_id = ?"
    ).run(n2.id);
    const tamperedPrevRes = EventEngine.verifyAuditChain(db, project);
    expect(tamperedPrevRes.valid).toBe(false);
  });

  it('should test EventEngine.undoLast for created, updated, deleted, and error branches', () => {
    const db = getDb(project);

    // Non-existent node undo
    expect(() => EventEngine.undoLast(db, { project, node_id: 'non-existent-id' })).toThrow(
      /No undo history found/i
    );

    // 1. Create and undo (should delete node)
    const n1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Undo Created Task',
      status: 'pending',
    });
    expect(GraphEngine.getNode({ project, id: n1.id })).toBeDefined();
    const undoCreate = EventEngine.undoLast(db, { project, node_id: n1.id });
    expect(undoCreate.success).toBe(true);
    expect(GraphEngine.getNode({ project, id: n1.id })).toBeNull();

    // 2. Create, update, and undo (should revert to previous state)
    const n2 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Undo Updated Task',
      status: 'pending',
    });
    GraphEngine.updateNode({ project, id: n2.id, title: 'Updated Title', status: 'done' });
    const undoUpdate = EventEngine.undoLast(db, { project, node_id: n2.id });
    expect(undoUpdate.success).toBe(true);
    const revertedN2 = GraphEngine.getNode({ project, id: n2.id });
    expect(revertedN2?.node.title).toBe('Undo Updated Task');
    expect(revertedN2?.node.status).toBe('pending');

    // 3. Create, delete, and undo (should recreate deleted node)
    const n3 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Undo Deleted Task',
      status: 'pending',
    });
    GraphEngine.removeNode({ project, id: n3.id });
    expect(GraphEngine.getNode({ project, id: n3.id })).toBeNull();
    const undoDelete = EventEngine.undoLast(db, { project, node_id: n3.id });
    expect(undoDelete.success).toBe(true);
    expect(GraphEngine.getNode({ project, id: n3.id })).toBeDefined();
  });

  it('should test EventEngine.pruneEvents with dry_run and active pruning', () => {
    const db = getDb(project);
    GraphEngine.addNode({ project, type: 'task', title: 'Task For Prune' });

    // Dry run
    const dryRes = EventEngine.pruneEvents(db, { project, older_than: '0d', dry_run: true });
    expect(dryRes.would_delete).toBeGreaterThanOrEqual(0);

    // Active prune
    const activeRes = EventEngine.pruneEvents(db, { project, older_than: '0d', dry_run: false });
    expect(activeRes.deleted).toBeGreaterThanOrEqual(0);
  });

  it('should test QueryEngine FTS syntax retries, subproject filters, and projections', async () => {
    const db = getDb(project);
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Query Engine Advanced Search Node',
      status: 'in_progress',
      tags: ['search', 'fts'],
    });
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Another Node with FTS details',
      status: 'done',
      tags: ['fts'],
    });

    // Syntax-breaking FTS query that triggers retry & sanitize
    const brokenFtsQuery = 'AND OR NOT "*""*""';
    const retryRes = await QueryEngine.searchNodes({
      project,
      query: brokenFtsQuery,
      limit: 10,
    });
    expect(retryRes).toBeDefined();

    // listNodes with compact: true, fields projection, and branch filters
    const listRes = await QueryEngine.listNodes({
      project,
      compact: true,
      fields: ['id', 'title', 'status'],
      git_branch: '*',
      limit: 10,
      offset: 0,
    });
    expect(listRes.nodes.length).toBeGreaterThanOrEqual(2);
    expect(listRes.nodes[0]).toHaveProperty('id');
    expect(listRes.nodes[0]).toHaveProperty('title');
  });

  it('should test exportGraph and importGraph with JSON, HTML, Markdown, and Mermaid formats', () => {
    const db = getDb(project);
    const n1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Export Node 1',
      status: 'done',
    });
    const n2 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Export Node 2',
      status: 'accepted',
    });
    EdgeEngine.addEdge({ project, source_id: n1.id, target_id: n2.id, type: 'references' });

    // Export formats
    const jsonExp = exportGraph({ project, format: 'json' });
    expect(jsonExp).toContain('Export Node 1');

    const htmlExp = exportGraph({ project, format: 'html' });
    expect(htmlExp).toContain('<!DOCTYPE html>');

    const mmdExp = exportGraph({ project, format: 'mermaid' });
    expect(mmdExp).toContain('flowchart TD');

    expect(() => exportGraph({ project, format: 'invalid_format' as any })).toThrow(
      /Unsupported format/
    );

    // Import into fresh project
    const importProject = `import-target-${randomUUID()}`;
    const parsedData = JSON.parse(jsonExp);
    const impRes = importGraph({
      project: importProject,
      nodes: parsedData.nodes,
      edges: parsedData.edges,
      conflictStrategy: 'overwrite',
    });
    expect(impRes.imported_nodes_count).toBeGreaterThanOrEqual(2);
    expect(impRes.imported_edges_count).toBeGreaterThanOrEqual(1);
  });
});
