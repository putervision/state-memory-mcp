import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateMemoryReferences } from '../../src/engine/cross-memory-validation.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { getDb, closeDb } from '../../src/engine/db.js';

describe('Cross-Memory System-of-Record Validation Engine', () => {
  const project = 'memory-val-test-project';

  beforeEach(() => {
    closeDb(project);
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  afterEach(() => {
    closeDb(project);
  });

  it('should validate external file references in nodes and report valid vs broken links', () => {
    const validNode = GraphEngine.addNode({
      project,
      type: 'artifact',
      title: 'Valid File Link',
      metadata: { file_path: '/etc/hosts' }, // /etc/hosts exists on linux
    });

    const brokenNode = GraphEngine.addNode({
      project,
      type: 'artifact',
      title: 'Broken File Link',
      metadata: { file_path: '/non_existent_path_12345.txt' },
    });

    const res = validateMemoryReferences({ project, auto_heal: true });

    expect(res.total_references_checked).toBe(2);
    expect(res.valid_references_count).toBe(1);
    expect(res.broken_references.length).toBe(1);
    expect(res.broken_references[0].node_id).toBe(brokenNode.id);
    expect(res.healed_nodes_count).toBe(1);

    const healedNode = GraphEngine.getNode({ project, id: brokenNode.id });
    expect(healedNode?.node.metadata.reference_validation_warning).toBeDefined();
  });
});
