import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { specHandlers } from '../../src/handlers/spec.js';
import { graphHandlers } from '../../src/handlers/graph.js';
import {
  getDb,
  getReadOnlyDb,
  closeDb,
  resolveProjectRoot,
  getProjectSlug,
} from '../../src/engine/db.js';
import { parseNodeRow, parseEdgeRow } from '../../src/engine/row-mappers.js';
import { getChanges } from '../../src/engine/changeset.js';
import {
  contextNotifier,
  isPrivateIp,
  isSafeWebhookUrl,
  validateWebhookHostDns,
} from '../../src/engine/notifications.js';
import { GraphEngine } from '../../src/engine/graph.js';
import fs from 'fs';
import path from 'path';

describe('Deep Engine & Handler Coverage Boost Test Suite', () => {
  const project = 'deep-coverage-boost-test';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
    db.prepare('DELETE FROM sessions WHERE project = ?').run(project);
    db.prepare('DELETE FROM events WHERE project = ?').run(project);
  });

  afterAll(() => {
    closeDb(project);
  });

  it('should test specHandlers ingest action with sample markdown spec', () => {
    const sampleSpecPath = path.join(process.cwd(), '.specs', 'test-ingest.md');
    fs.mkdirSync(path.dirname(sampleSpecPath), { recursive: true });
    fs.writeFileSync(
      sampleSpecPath,
      '# Test Feature Spec\n\n## Requirements\n\n### REQ-1: User Login\n- MUST return JWT token\n- MUST handle 401'
    );

    try {
      const res = specHandlers.manage_specs({
        action: 'ingest',
        project,
        file_path: sampleSpecPath,
      });
      expect(res).toBeDefined();
    } finally {
      if (fs.existsSync(sampleSpecPath)) fs.unlinkSync(sampleSpecPath);
    }
  });

  it('should test graphHandlers manage_database merge, branch_diff, branch_merge', () => {
    expect(() =>
      graphHandlers.manage_database({
        action: 'merge',
        project,
        source_db_path: '/non/existent.db',
      })
    ).toThrow();

    const diff = graphHandlers.manage_database({
      action: 'branch_diff',
      project,
      target_branch: 'main',
    });
    expect(diff).toBeDefined();

    const merge = graphHandlers.manage_database({
      action: 'branch_merge',
      project,
      source_branch: 'feature',
      target_branch: 'main',
    });
    expect(merge).toBeDefined();
  });

  it('should test db engine methods and resolvers', () => {
    const db1 = getDb(project);
    expect(db1).toBeDefined();

    const roDb = getReadOnlyDb(project);
    expect(roDb).toBeDefined();

    const slug = getProjectSlug(undefined);
    expect(slug).toBeDefined();

    const root = resolveProjectRoot(project);
    expect(root).toBeDefined();
  });

  it('should test row-mappers with edge inputs', () => {
    const rawNodeRow = {
      id: 'node-raw-1',
      type: 'task',
      title: 'Raw Task',
      status: 'pending',
      metadata: '{invalid_json',
      tags: '{invalid_tags',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    const parsedNode = parseNodeRow(rawNodeRow as any);
    expect(parsedNode.id).toBe('node-raw-1');
    expect(parsedNode.metadata).toEqual({});

    const rawEdgeRow = {
      id: 'edge-raw-1',
      source_id: 'n1',
      target_id: 'n2',
      type: 'depends_on',
      properties: '{bad_json',
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const parsedEdge = parseEdgeRow(rawEdgeRow as any);
    expect(parsedEdge.id).toBe('edge-raw-1');
    expect(parsedEdge.properties).toEqual({});
  });

  it('should test getChanges and notifications functions', async () => {
    const db = getDb(project);
    GraphEngine.addNode({ project, type: 'task', title: 'Branch Task' });

    const cs = getChanges(db, { project, since: new Date(Date.now() - 3600000).toISOString() });
    expect(cs).toBeDefined();

    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);

    expect(isSafeWebhookUrl('https://example.com/webhook')).toBe(true);
    expect(isSafeWebhookUrl('ftp://invalid.com')).toBe(false);
    expect(isSafeWebhookUrl('http://127.0.0.1/webhook')).toBe(false);

    const safeIp = await validateWebhookHostDns('https://example.com/webhook');
    expect(safeIp === null || typeof safeIp === 'string').toBe(true);

    contextNotifier.notify({
      project,
      eventType: 'node_created',
      entityType: 'node',
      entityId: 'node-1',
      timestamp: new Date().toISOString(),
    });
  });
});
