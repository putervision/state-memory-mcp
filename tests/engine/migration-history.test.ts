import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migrations, rollbackMigration } from '../../src/engine/migrations.js';
import { getMetaValue, setMetaValue } from '../../src/engine/db.js';

describe('Schema Migration History & Rollback Tests', () => {
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

  it('should sequentially execute all migrations from v1 through latest v9', () => {
    for (const m of migrations) {
      db.transaction(() => {
        m.up(db);
        setMetaValue(db, 'version', m.version.toString());
      })();
    }

    const version = getMetaValue(db, 'version');
    expect(version).toBe('9');

    // Assert schema tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('nodes');
    expect(tableNames).toContain('edges');
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('events');
    expect(tableNames).toContain('snapshots');
  });

  it('should support migration rollback step-down to earlier versions', () => {
    // Run up to v9
    for (const m of migrations) {
      db.transaction(() => {
        m.up(db);
        setMetaValue(db, 'version', m.version.toString());
      })();
    }

    expect(getMetaValue(db, 'version')).toBe('9');

    // Rollback to v4
    const rolledBackVersion = rollbackMigration(db, 4);
    expect(rolledBackVersion).toBe(4);
    expect(getMetaValue(db, 'version')).toBe('4');

    // Rollback to v0
    const finalVersion = rollbackMigration(db, 0);
    expect(finalVersion).toBe(0);
    expect(getMetaValue(db, 'version')).toBe('0');
  });
});
