import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrations, rollbackMigration } from '../../src/engine/migrations.js';
import { getMetaValue, setMetaValue } from '../../src/engine/db.js';

describe('Migration v12 Indexing & Rollback Tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.prepare(
      `
      CREATE TABLE schema_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `
    ).run();
    setMetaValue(db, 'version', '0');
  });

  afterEach(() => {
    db.close();
  });

  it('should run Migration v12 up and create all composite indexes', () => {
    for (const m of migrations) {
      db.transaction(() => {
        m.up(db);
        setMetaValue(db, 'version', m.version.toString());
      })();
    }

    expect(getMetaValue(db, 'version')).toBe('12');

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as {
      name: string;
    }[];
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_nodes_project_type_status_branch');
    expect(indexNames).toContain('idx_edges_project_branch_type');
    expect(indexNames).toContain('idx_events_project_session');
    expect(indexNames).toContain('idx_events_project_timestamp');
  });

  it('should rollback Migration v12 cleanly down to v11', () => {
    for (const m of migrations) {
      db.transaction(() => {
        m.up(db);
        setMetaValue(db, 'version', m.version.toString());
      })();
    }

    expect(getMetaValue(db, 'version')).toBe('12');

    const versionAfterRollback = rollbackMigration(db, 11);
    expect(versionAfterRollback).toBe(11);
    expect(getMetaValue(db, 'version')).toBe('11');

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as {
      name: string;
    }[];
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).not.toContain('idx_nodes_project_type_status_branch');
    expect(indexNames).not.toContain('idx_edges_project_branch_type');
    expect(indexNames).not.toContain('idx_events_project_session');
  });
});
