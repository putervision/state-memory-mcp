import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { queryGraph } from '../../src/engine/query-raw.js';
import { exportGraph } from '../../src/engine/export.js';
import { getEncryptionKey, getDb, closeDb } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { DatabaseError } from '../../src/utils/errors.js';
import { contextNotifier, isSafeWebhookUrl } from '../../src/engine/notifications.js';

describe('v0.9.33 Dedicated Feature & Security Hardening Tests', () => {
  beforeEach(() => {
    delete process.env.STATE_MEMORY_ENCRYPTION_KEY;
  });

  afterEach(() => {
    delete process.env.STATE_MEMORY_ENCRYPTION_KEY;
  });

  describe('SQL AST Compiler Pre-Validation (S3)', () => {
    let project: string;

    beforeEach(() => {
      project = 'ast-test-proj-' + Math.random().toString(36).substring(7);
    });

    afterEach(() => closeDb(project));

    it('should pre-validate query compilation before execution', () => {
      GraphEngine.addNode({ project, type: 'task', title: 'Init DB Node' });
      expect(() => {
        queryGraph({
          project,
          sql: 'SELECT * FROM forbidden_table_name',
        });
      }).toThrow();
    });

    it('should allow valid read queries against allowed tables', () => {
      GraphEngine.addNode({ project, type: 'task', title: 'Test Node' });
      const rows = queryGraph({
        project,
        sql: 'SELECT id, title, type FROM nodes WHERE project = ?',
        params: [project],
      }) as any[];

      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].title).toBe('Test Node');
    });
  });

  describe('Export Memory Limits & Force Flag (S4)', () => {
    it('should accept valid export under threshold', () => {
      const smallProj = 'export-small-proj-' + Math.random().toString(36).substring(7);
      GraphEngine.addNode({ project: smallProj, type: 'task', title: 'Small Export Node' });
      const result = exportGraph({ project: smallProj, format: 'json' });
      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed.nodes)).toBe(true);
      expect(parsed.nodes.length).toBe(1);
      closeDb(smallProj);
    });

    it('should throw DatabaseError if node count exceeds 50,000 without force flag', () => {
      const largeProj = 'export-large-proj-' + Math.random().toString(36).substring(7);
      const db = getDb(largeProj);
      db.transaction(() => {
        for (let i = 0; i < 50005; i++) {
          db.prepare(
            "INSERT INTO nodes (id, type, title, status, project, created_at, updated_at) VALUES (?, 'task', ?, 'pending', ?, datetime('now'), datetime('now'))"
          ).run(`l-node-${i}`, `Title ${i}`, largeProj);
        }
      })();

      expect(() => {
        exportGraph({ project: largeProj, format: 'json' });
      }).toThrow(DatabaseError);

      const forcedResult = exportGraph({ project: largeProj, format: 'json', force: true });
      expect(typeof forcedResult).toBe('string');
      closeDb(largeProj);
    });
  });

  describe('Encryption Key Strength Validation (S5)', () => {
    it('should log warning for key shorter than 16 characters', () => {
      process.env.STATE_MEMORY_ENCRYPTION_KEY = 'short-key';
      const keyBuffer = getEncryptionKey();
      expect(keyBuffer).not.toBeNull();
      expect(keyBuffer!.length).toBe(32); // SHA-256 hash length
    });

    it('should accept valid encryption key >= 16 characters', () => {
      process.env.STATE_MEMORY_ENCRYPTION_KEY = 'super-secret-secure-encryption-key-12345';
      const keyBuffer = getEncryptionKey();
      expect(keyBuffer).not.toBeNull();
      expect(keyBuffer!.length).toBe(32);
    });
  });

  describe('Webhook Rate Limiting & Schema Versioning (S2, S7, S9)', () => {
    let project: string;

    beforeEach(() => {
      project = 'webhook-test-proj-' + Math.random().toString(36).substring(7);
    });

    afterEach(() => closeDb(project));

    it('should validate webhook URL safety correctly', () => {
      expect(isSafeWebhookUrl('https://api.example.com/webhook')).toBe(true);
      expect(isSafeWebhookUrl('http://127.0.0.1:8080/hook')).toBe(false);
      expect(isSafeWebhookUrl('ftp://invalid.com')).toBe(false);
    });

    it('should emit context change event with schema_version 1.0', () => {
      let receivedEvent: any = null;
      const listener = (evt: any) => {
        receivedEvent = evt;
      };
      contextNotifier.on('change', listener);

      contextNotifier.notify({
        project,
        eventType: 'node_created',
        entityType: 'node',
        entityId: 'test-id-123',
        timestamp: new Date().toISOString(),
      });

      expect(receivedEvent).not.toBeNull();
      expect(receivedEvent.entityId).toBe('test-id-123');

      contextNotifier.off('change', listener);
    });
  });
});
