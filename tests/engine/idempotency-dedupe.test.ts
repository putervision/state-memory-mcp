import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { GraphEngine } from '../../src/engine/graph.js';
import { QueryEngine } from '../../src/engine/queries.js';
import { dedupeGraph } from '../../src/engine/validate.js';
import { getDb, closeAllDbs, getDbPath } from '../../src/engine/db.js';
import { analyticsHandlers } from '../../src/handlers/analytics.js';

describe('Idempotency, Deduplication, and FTS Encryption', () => {
  const project = 'test-idempotency-dedupe-proj';

  beforeEach(() => {
    closeAllDbs();
    const dbPath = getDbPath(project);
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
      } catch {}
    }
  });

  afterEach(() => {
    closeAllDbs();
  });

  it('should return existing node when addNode is called with identical idempotency_key', () => {
    const node1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Idempotent Task 1',
      idempotency_key: 'unique-idem-key-123',
      metadata: { priority: 'high' },
    });

    expect(node1).toBeDefined();
    expect(node1.title).toBe('Idempotent Task 1');

    // Second call with same key should return existing node without creating a duplicate
    const node2 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Idempotent Task 1 (attempt 2)',
      idempotency_key: 'unique-idem-key-123',
    });

    expect(node2.id).toBe(node1.id);
    expect(node2.title).toBe('Idempotent Task 1');

    const db = getDb(project);
    const count = db
      .prepare('SELECT COUNT(*) as cnt FROM nodes WHERE project = ?')
      .get(project) as { cnt: number };
    expect(count.cnt).toBe(1);
  });

  it('should detect duplicate nodes with dedupeGraph and merge when apply is true', () => {
    const db = getDb(project);

    // Insert 2 nodes with duplicate title and type
    const n1 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Duplicate Decision',
      metadata: { choice: 'A' },
    });

    const n2 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Duplicate Decision',
      metadata: { choice: 'B' },
    });

    expect(n1.id).not.toBe(n2.id);

    // Dry run
    const dryRun = dedupeGraph(db, { project, apply: false });
    expect(dryRun.duplicate_groups_found).toBe(1);
    expect(dryRun.duplicate_nodes_count).toBe(1);
    expect(dryRun.merged).toBe(false);

    // Apply deduplication
    const applied = dedupeGraph(db, { project, apply: true });
    expect(applied.duplicate_groups_found).toBe(1);
    expect(applied.merged).toBe(true);

    // Verify only 1 node remains
    const count = db
      .prepare('SELECT COUNT(*) as cnt FROM nodes WHERE project = ?')
      .get(project) as { cnt: number };
    expect(count.cnt).toBe(1);
  });

  it('should allow full-text search via searchNodes even when payload is encrypted', async () => {
    const originalKey = process.env.STATE_MEMORY_ENCRYPTION_KEY;
    process.env.STATE_MEMORY_ENCRYPTION_KEY = 'encryption-key-for-fts-test-32b!';

    try {
      const node = GraphEngine.addNode({
        project,
        type: 'task',
        title: 'Searchable Encrypted Task',
        metadata: { specializedKeyword: 'cryptographic_quantum_entropy' },
        tags: ['secure_tag_123'],
      });

      expect(node).toBeDefined();

      const db = getDb(project);

      // Verify raw row in nodes table has ENC: prefix
      const rawRow = db.prepare('SELECT metadata, tags FROM nodes WHERE id = ?').get(node.id) as {
        metadata: string;
        tags: string;
      };
      expect(rawRow.metadata.startsWith('ENC:')).toBe(true);
      expect(rawRow.tags.startsWith('ENC:')).toBe(true);

      // Verify searchNodes finds the encrypted node using plaintext FTS index
      const searchRes = await QueryEngine.searchNodes({
        project,
        query: 'cryptographic_quantum_entropy',
        git_branch: '*',
      });
      expect(searchRes.nodes.length).toBe(1);
      expect(searchRes.nodes[0].id).toBe(node.id);
      expect(searchRes.nodes[0].metadata.specializedKeyword).toBe('cryptographic_quantum_entropy');
    } finally {
      process.env.STATE_MEMORY_ENCRYPTION_KEY = originalKey;
    }
  });

  it('should support run_diagnostics action dedupe', () => {
    const result = analyticsHandlers.run_diagnostics({ action: 'dedupe', project, apply: false });
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });
});
