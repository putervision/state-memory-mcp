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
      db.prepare(`
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
      `).run();

      db.prepare(`
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
      `).run();

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

      db.prepare(`
        CREATE VIRTUAL TABLE nodes_fts USING fts5(
          title, metadata, tags,
          content='nodes',
          content_rowid='rowid'
        )
      `).run();

      db.prepare(`
        CREATE TRIGGER nodes_ai AFTER INSERT ON nodes BEGIN
          INSERT INTO nodes_fts(rowid, title, metadata, tags) VALUES (new.rowid, new.title, new.metadata, new.tags);
        END
      `).run();

      db.prepare(`
        CREATE TRIGGER nodes_ad AFTER DELETE ON nodes BEGIN
          INSERT INTO nodes_fts(nodes_fts, rowid, title, metadata, tags) VALUES ('delete', old.rowid, old.title, old.metadata, old.tags);
        END
      `).run();

      db.prepare(`
        CREATE TRIGGER nodes_au AFTER UPDATE ON nodes BEGIN
          INSERT INTO nodes_fts(nodes_fts, rowid, title, metadata, tags) VALUES ('delete', old.rowid, old.title, old.metadata, old.tags);
          INSERT INTO nodes_fts(rowid, title, metadata, tags) VALUES (new.rowid, new.title, new.metadata, new.tags);
        END
      `).run();
    }
  },
  // Version 2: Add composite indexes
  {
    version: 2,
    up: (db) => {
      logger.info('Running migration v2: adding composite indexes...');
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_nodes_project_type_status ON nodes(project, type, status)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_nodes_project_branch_type ON nodes(project, git_branch, type)`).run();
    }
  },
  // Version 3: Optimize FTS5 update triggers (only re-index on actual text/tag changes)
  {
    version: 3,
    up: (db) => {
      logger.info('Running migration v3: optimizing FTS5 update trigger...');
      db.prepare(`DROP TRIGGER IF EXISTS nodes_au`).run();
      db.prepare(`
        CREATE TRIGGER nodes_au AFTER UPDATE OF title, metadata, tags ON nodes BEGIN
          INSERT INTO nodes_fts(nodes_fts, rowid, title, metadata, tags) VALUES ('delete', old.rowid, old.title, old.metadata, old.tags);
          INSERT INTO nodes_fts(rowid, title, metadata, tags) VALUES (new.rowid, new.title, new.metadata, new.tags);
        END
      `).run();
    }
  }
];
