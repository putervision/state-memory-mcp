import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';

export interface Migration {
  version: number;
  up: (db: any) => void;
}

export const migrations: Migration[] = [
  // Version 1: Baseline schema setup
  {
    version: 1,
    up: (db) => {
      db.prepare(
        `
        CREATE TABLE nodes (
          id          TEXT PRIMARY KEY,
          type        TEXT NOT NULL,
          title       TEXT NOT NULL,
          status      TEXT NOT NULL,
          project     TEXT NOT NULL,
          git_branch  TEXT DEFAULT 'main',
          metadata    TEXT DEFAULT '{}',
          tags        TEXT DEFAULT '[]',
          created_at  TEXT NOT NULL,
          updated_at  TEXT NOT NULL
        )
      `
      ).run();

      db.prepare(
        `
        CREATE TABLE edges (
          id          TEXT PRIMARY KEY,
          source_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
          target_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
          type        TEXT NOT NULL,
          properties  TEXT DEFAULT '{}',
          project     TEXT NOT NULL,
          git_branch  TEXT DEFAULT 'main',
          created_at  TEXT NOT NULL,
          UNIQUE(source_id, target_id, type)
        )
      `
      ).run();

      db.prepare(`CREATE INDEX idx_nodes_type ON nodes(type)`).run();
      db.prepare(`CREATE INDEX idx_nodes_status ON nodes(status)`).run();
      db.prepare(`CREATE INDEX idx_nodes_project ON nodes(project)`).run();
      db.prepare(`CREATE INDEX idx_nodes_project_branch ON nodes(project, git_branch)`).run();
      db.prepare(`CREATE INDEX idx_nodes_project_type ON nodes(project, type)`).run();
      db.prepare(`CREATE INDEX idx_nodes_project_status ON nodes(project, status)`).run();

      db.prepare(`CREATE INDEX idx_edges_source ON edges(source_id)`).run();
      db.prepare(`CREATE INDEX idx_edges_target ON edges(target_id)`).run();
      db.prepare(`CREATE INDEX idx_edges_type ON edges(type)`).run();
      db.prepare(`CREATE INDEX idx_edges_project ON edges(project)`).run();
      db.prepare(`CREATE INDEX idx_edges_project_branch ON edges(project, git_branch)`).run();

      db.prepare(
        `
        CREATE VIRTUAL TABLE nodes_fts USING fts5(
          title, metadata, tags,
          content='nodes',
          content_rowid='rowid'
        )
      `
      ).run();

      db.prepare(
        `
        CREATE TRIGGER nodes_ai AFTER INSERT ON nodes BEGIN
          INSERT INTO nodes_fts(rowid, title, metadata, tags) VALUES (new.rowid, new.title, new.metadata, new.tags);
        END
      `
      ).run();

      db.prepare(
        `
        CREATE TRIGGER nodes_ad AFTER DELETE ON nodes BEGIN
          INSERT INTO nodes_fts(nodes_fts, rowid, title, metadata, tags) VALUES ('delete', old.rowid, old.title, old.metadata, old.tags);
        END
      `
      ).run();

      db.prepare(
        `
        CREATE TRIGGER nodes_au AFTER UPDATE ON nodes BEGIN
          INSERT INTO nodes_fts(nodes_fts, rowid, title, metadata, tags) VALUES ('delete', old.rowid, old.title, old.metadata, old.tags);
          INSERT INTO nodes_fts(rowid, title, metadata, tags) VALUES (new.rowid, new.title, new.metadata, new.tags);
        END
      `
      ).run();
    },
  },
  // Version 2: Add composite indexes
  {
    version: 2,
    up: (db) => {
      logger.info('Running migration v2: adding composite indexes...');
      db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_nodes_project_type_status ON nodes(project, type, status)`
      ).run();
      db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_nodes_project_branch_type ON nodes(project, git_branch, type)`
      ).run();
    },
  },
  // Version 3: Optimize FTS5 update triggers (only re-index on actual text/tag changes)
  {
    version: 3,
    up: (db) => {
      logger.info('Running migration v3: optimizing FTS5 update trigger...');
      db.prepare(`DROP TRIGGER IF EXISTS nodes_au`).run();
      db.prepare(
        `
        CREATE TRIGGER nodes_au AFTER UPDATE OF title, metadata, tags ON nodes BEGIN
          INSERT INTO nodes_fts(nodes_fts, rowid, title, metadata, tags) VALUES ('delete', old.rowid, old.title, old.metadata, old.tags);
          INSERT INTO nodes_fts(rowid, title, metadata, tags) VALUES (new.rowid, new.title, new.metadata, new.tags);
        END
      `
      ).run();
    },
  },
  // Version 4: Event-sourced audit trail, session tracking, and persistent snapshots
  {
    version: 4,
    up: (db) => {
      logger.info('Running migration v4: setting up sessions, events, and snapshots...');

      db.prepare(
        `
        CREATE TABLE IF NOT EXISTS sessions (
          id          TEXT PRIMARY KEY,
          agent_id    TEXT NOT NULL DEFAULT 'unknown',
          project     TEXT NOT NULL,
          started_at  TEXT NOT NULL,
          ended_at    TEXT,
          metadata    TEXT DEFAULT '{}'
        )
      `
      ).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project)`).run();

      db.prepare(
        `
        CREATE TABLE IF NOT EXISTS events (
          id          TEXT PRIMARY KEY,
          session_id  TEXT,
          event_type  TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id   TEXT NOT NULL,
          before_state TEXT,
          after_state  TEXT,
          project     TEXT NOT NULL,
          timestamp   TEXT NOT NULL,
          metadata    TEXT DEFAULT '{}'
        )
      `
      ).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_events_project ON events(project)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity_id)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)`).run();

      db.prepare(
        `
        CREATE TABLE IF NOT EXISTS snapshots (
          id          TEXT PRIMARY KEY,
          project     TEXT NOT NULL,
          session_id  TEXT,
          snapshot    TEXT NOT NULL,
          node_count  INTEGER NOT NULL,
          edge_count  INTEGER NOT NULL,
          created_at  TEXT NOT NULL
        )
      `
      ).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_snapshots_project ON snapshots(project)`).run();
    },
  },
  // Version 5: generated column commit_hash and optimized composite indexes
  {
    version: 5,
    up: (db) => {
      logger.info(
        'Running migration v5: adding commit_hash generated column and composite indexes...'
      );
      try {
        db.prepare(
          `ALTER TABLE nodes ADD COLUMN commit_hash TEXT GENERATED ALWAYS AS (json_extract(metadata, '$.commit_hash')) VIRTUAL`
        ).run();
      } catch (err: any) {
        logger.debug(`Could not add commit_hash column (it may already exist): ${err.message}`);
      }
      db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_nodes_project_commit_hash ON nodes(project, commit_hash)`
      ).run();
      db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_edges_type_source ON edges(type, source_id)`
      ).run();
      db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_edges_type_target ON edges(type, target_id)`
      ).run();
    },
  },
  // Version 6: Add updated_at to edges table
  {
    version: 6,
    up: (db) => {
      logger.info('Running migration v6: adding updated_at column to edges table...');
      try {
        db.prepare('ALTER TABLE edges ADD COLUMN updated_at TEXT').run();
      } catch (err: any) {
        logger.debug(
          `Could not add updated_at column to edges (it may already exist): ${err.message}`
        );
      }
      db.prepare('CREATE INDEX IF NOT EXISTS idx_edges_updated_at ON edges(updated_at)').run();
    },
  },
  // Version 7: Drop FTS5 triggers to handle sync failures gracefully in JS
  {
    version: 7,
    up: (db) => {
      logger.info('Running migration v7: dropping FTS5 triggers...');
      db.prepare('DROP TRIGGER IF EXISTS nodes_ai').run();
      db.prepare('DROP TRIGGER IF EXISTS nodes_ad').run();
      db.prepare('DROP TRIGGER IF EXISTS nodes_au').run();
    },
  },
  // Version 8: Cryptographic SHA-256 Session Audit Hash Chaining (Armstrong 2026)
  {
    version: 8,
    up: (db) => {
      logger.info('Running migration v8: adding cryptographic hash chaining to events table...');
      try {
        db.prepare('ALTER TABLE events ADD COLUMN hash TEXT').run();
        db.prepare('ALTER TABLE events ADD COLUMN prev_hash TEXT').run();
      } catch (err: any) {
        logger.debug(`Could not add hash/prev_hash to events: ${err.message}`);
      }
      db.prepare('CREATE INDEX IF NOT EXISTS idx_events_hash ON events(hash)').run();

      // Backfill historical unhashed events in chronological order
      try {
        const events = db.prepare('SELECT * FROM events WHERE hash IS NULL ORDER BY rowid ASC').all() as any[];
        if (events.length > 0) {
          logger.info(`Backfilling cryptographic SHA-256 hashes for ${events.length} historical events...`);
          let expectedPrevHash = '0000000000000000000000000000000000000000000000000000000000000000';
          const updateStmt = db.prepare('UPDATE events SET hash = ?, prev_hash = ? WHERE id = ?');
          db.transaction(() => {
            for (const ev of events) {
              const payload = `${expectedPrevHash}|${ev.id}|${ev.event_type}|${ev.entity_id}|${ev.after_state || ''}|${ev.timestamp}`;
              const hash = crypto.createHash('sha256').update(payload).digest('hex');
              updateStmt.run(hash, expectedPrevHash, ev.id);
              expectedPrevHash = hash;
            }
          })();
        }
      } catch (err: any) {
        logger.warn(`Could not backfill historical event hashes: ${err.message}`);
      }
    },
  },
];
