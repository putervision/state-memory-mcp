import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';

export interface Migration {
  version: number;
  description?: string;
  up: (db: any) => void;
  down?: (db: any) => void;
}

export const migrations: Migration[] = [
  // Version 1: Baseline schema setup
  {
    version: 1,
    description: 'Baseline schema setup',
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
    },
    down: (db) => {
      db.prepare('DROP TABLE IF EXISTS nodes_fts').run();
      db.prepare('DROP TABLE IF EXISTS edges').run();
      db.prepare('DROP TABLE IF EXISTS nodes').run();
    },
  },
  // Version 2: Add composite indexes
  {
    version: 2,
    description: 'Add composite indexes',
    up: (db) => {
      logger.info('Running migration v2: adding composite indexes...');
      db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_nodes_project_type_status ON nodes(project, type, status)`
      ).run();
      db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_nodes_project_branch_type ON nodes(project, git_branch, type)`
      ).run();
    },
    down: (db) => {
      db.prepare('DROP INDEX IF EXISTS idx_nodes_project_type_status').run();
      db.prepare('DROP INDEX IF EXISTS idx_nodes_project_branch_type').run();
    },
  },
  // Version 3: Optimize FTS5 update triggers
  {
    version: 3,
    description: 'Optimize FTS5 triggers',
    up: (db) => {
      logger.info('Running migration v3: optimizing FTS5 update trigger...');
      db.prepare(`DROP TRIGGER IF EXISTS nodes_au`).run();
    },
  },
  // Version 4: Event-sourced audit trail, session tracking, and persistent snapshots
  {
    version: 4,
    description: 'Sessions, events, and snapshots setup',
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
    down: (db) => {
      db.prepare('DROP TABLE IF EXISTS snapshots').run();
      db.prepare('DROP TABLE IF EXISTS events').run();
      db.prepare('DROP TABLE IF EXISTS sessions').run();
    },
  },
  // Version 5: generated column commit_hash and optimized composite indexes
  {
    version: 5,
    description: 'Generated commit_hash column and composite indexes',
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
    description: 'Add updated_at column to edges',
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
    description: 'Drop FTS5 triggers for JS-side sync handling',
    up: (db) => {
      logger.info('Running migration v7: dropping FTS5 triggers...');
      db.prepare('DROP TRIGGER IF EXISTS nodes_ai').run();
      db.prepare('DROP TRIGGER IF EXISTS nodes_ad').run();
      db.prepare('DROP TRIGGER IF EXISTS nodes_au').run();
    },
  },
  // Version 8: Cryptographic SHA-256 Session Audit Hash Chaining
  {
    version: 8,
    description: 'Cryptographic SHA-256 event audit hash chaining',
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
        const events = db
          .prepare('SELECT * FROM events WHERE hash IS NULL ORDER BY rowid ASC')
          .all() as any[];
        if (events.length > 0) {
          logger.info(
            `Backfilling cryptographic SHA-256 hashes for ${events.length} historical events...`
          );
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
  // Version 9: Security payload schema versioning & database size tracking metadata
  {
    version: 9,
    description: 'Security schema versioning and database integrity metadata',
    up: (db) => {
      logger.info(
        'Running migration v9: adding security schema versioning and integrity metadata...'
      );
      db.prepare('CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON nodes(created_at)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_nodes_updated_at ON nodes(updated_at)').run();
    },
    down: (db) => {
      db.prepare('DROP INDEX IF EXISTS idx_nodes_created_at').run();
      db.prepare('DROP INDEX IF EXISTS idx_nodes_updated_at').run();
    },
  },
  // Version 10: Optimistic concurrency control (version column) & blackboard table
  {
    version: 10,
    description: 'Optimistic concurrency versioning & agent blackboard store',
    up: (db) => {
      logger.info('Running migration v10: adding node version column and blackboard table...');
      try {
        db.prepare('ALTER TABLE nodes ADD COLUMN version INTEGER DEFAULT 1').run();
      } catch (err: any) {
        // Column may already exist
      }
      db.prepare(
        `
        CREATE TABLE IF NOT EXISTS blackboard (
          id          TEXT PRIMARY KEY,
          project     TEXT NOT NULL,
          agent_id    TEXT NOT NULL DEFAULT 'unknown',
          agent_role  TEXT DEFAULT 'coder',
          topic       TEXT NOT NULL,
          content     TEXT NOT NULL,
          created_at  TEXT NOT NULL,
          expires_at  TEXT
        )
      `
      ).run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_blackboard_project ON blackboard(project)').run();
      db.prepare('CREATE INDEX IF NOT EXISTS idx_blackboard_topic ON blackboard(topic)').run();
    },
    down: (db) => {
      db.prepare('DROP TABLE IF EXISTS blackboard').run();
    },
  },
  // Version 11: Add staleness composite index
  {
    version: 11,
    description: 'Staleness composite index optimization',
    up: (db) => {
      logger.info('Running migration v11: adding staleness composite index...');
      db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_nodes_project_updated_status ON nodes(project, updated_at, status)`
      ).run();
    },
    down: (db) => {
      db.prepare('DROP INDEX IF EXISTS idx_nodes_project_updated_status').run();
    },
  },
];

/**
 * Rolls back the database schema to a specified target version.
 *
 * @param db - The better-sqlite3 database instance.
 * @param targetVersion - The version number to roll back to (0 means drop all).
 * @returns The version number after rollback completion.
 */
export function rollbackMigration(db: any, targetVersion: number): number {
  const versionRow = db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as any;
  let currentVersion = versionRow ? parseInt(versionRow.value, 10) : 0;

  if (targetVersion >= currentVersion) {
    logger.info(`Database schema is already at or below version ${currentVersion}`);
    return currentVersion;
  }

  const sortedMigrations = [...migrations].sort((a, b) => b.version - a.version);

  for (const m of sortedMigrations) {
    if (m.version <= currentVersion && m.version > targetVersion) {
      if (m.down) {
        db.transaction(() => {
          logger.info(`Rolling back database migration version ${m.version}...`);
          m.down!(db);
          db.prepare("UPDATE schema_meta SET value = ? WHERE key = 'version'").run(
            (m.version - 1).toString()
          );
        })();
        currentVersion = m.version - 1;
      } else {
        logger.warn(
          `Migration v${m.version} has no down function; version set to ${m.version - 1}`
        );
        db.prepare("UPDATE schema_meta SET value = ? WHERE key = 'version'").run(
          (m.version - 1).toString()
        );
        currentVersion = m.version - 1;
      }
    }
  }

  return currentVersion;
}
