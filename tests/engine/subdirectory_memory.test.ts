import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import {
  findSubdirectoryMemoryDbs,
  getWorkspaceGitRepos,
  clearSubdirectoryCache,
} from '../../src/engine/subdirectory-scanner.js';
import { auditProjectDb } from '../../src/engine/audit.js';
import { QueryEngine } from '../../src/engine/queries.js';
import { doctorAction } from '../../src/cli/commands/doctor.js';
import { subprojectsAction } from '../../src/cli/commands/subprojects.js';
import { closeAllDbs } from '../../src/engine/db.js';

describe('Subdirectory Git Repos & Memory Data Observation Tests', () => {
  let tmpDir: string;
  let subDirA: string;
  let subDirB: string;

  beforeEach(() => {
    clearSubdirectoryCache();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-memory-subdir-test-'));

    // Create subDirA with .state-memory-mcp and a graph.db
    subDirA = path.join(tmpDir, 'packages', 'api');
    const dbDirA = path.join(subDirA, '.state-memory-mcp', 'api');
    fs.mkdirSync(dbDirA, { recursive: true });
    fs.mkdirSync(path.join(subDirA, '.git'), { recursive: true });

    const dbA = new Database(path.join(dbDirA, 'graph.db'));
    dbA.exec(`
      CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO schema_meta VALUES ('version', '1');
      CREATE TABLE nodes (
        id TEXT PRIMARY KEY, project TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
        status TEXT NOT NULL, git_branch TEXT NOT NULL, metadata TEXT, tags TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE edges (
        id TEXT PRIMARY KEY, project TEXT NOT NULL, source_id TEXT NOT NULL, target_id TEXT NOT NULL,
        type TEXT NOT NULL, git_branch TEXT NOT NULL, metadata TEXT, created_at TEXT NOT NULL
      );
      INSERT INTO nodes VALUES (
        'sub-node-1', 'api', 'task', 'API Microservice Task',
        'pending', 'main', '{}', '["subproject:api"]',
        '2026-07-24T12:00:00Z', '2026-07-24T12:00:00Z'
      );
    `);
    dbA.close();

    // Create subDirB with .git
    subDirB = path.join(tmpDir, 'packages', 'web');
    fs.mkdirSync(path.join(subDirB, '.git'), { recursive: true });
  });

  afterEach(() => {
    closeAllDbs();
    clearSubdirectoryCache();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should discover sub-directory memory databases with TTL caching', async () => {
    const subDbs1 = await findSubdirectoryMemoryDbs(tmpDir);
    expect(subDbs1.length).toBeGreaterThanOrEqual(1);
    const apiDb = subDbs1.find((d) => d.relPath.includes('api'));
    expect(apiDb).toBeDefined();
    expect(apiDb?.dbPath).toContain('graph.db');

    // Repeat call to hit cache
    const subDbs2 = await findSubdirectoryMemoryDbs(tmpDir);
    expect(subDbs2).toBe(subDbs1);
  });

  it('should audit sub-directory memory databases in auditProjectDb', async () => {
    const report = await auditProjectDb({ project: 'test-project', includeSubdirectories: true });
    expect(report.subdirectory_databases_audited).toBeDefined();
  });

  it('should run doctor health check including sub-directory git repos and memory databases', async () => {
    await expect(doctorAction({})).resolves.not.toThrow();
  });

  it('should run subprojects CLI action without throwing errors', async () => {
    await expect(subprojectsAction({})).resolves.not.toThrow();
  });

  it('should support subproject filter in QueryEngine.listNodes', async () => {
    const result = await QueryEngine.listNodes({
      project: 'state-memory-mcp',
      subproject: 'root',
      include_subdirectories: false,
    });
    expect(Array.isArray(result.nodes)).toBe(true);
  });
});
