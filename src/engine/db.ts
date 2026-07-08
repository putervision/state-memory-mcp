import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger.js';

// Resolve project root by walking up from CWD
export function resolveProjectRoot(cwd: string = process.cwd()): string {
  let current = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(current, '.git')) || fs.existsSync(path.join(current, '.state-graph'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break; // reached root directory
    }
    current = parent;
  }
  return path.resolve(cwd); // default to cwd if none found
}

// Get the base directory for storing state-graph databases
export function getBaseDir(projectRoot: string): string {
  if (process.env.STATE_GRAPH_DIR) {
    return path.resolve(process.env.STATE_GRAPH_DIR);
  }
  // Default to project-local .state-graph directory
  return path.join(projectRoot, '.state-graph');
}

// Resolve project slug
export function getProjectSlug(project?: string): string {
  if (project && project.trim() !== '') {
    // Sanitize project name to be a safe slug (alphanumeric, dashes, underscores)
    return project.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  }
  const root = resolveProjectRoot();
  return path.basename(root).toLowerCase().replace(/[^a-z0-9-_]/g, '-');
}

const dbCache = new Map<string, Database.Database>();

export function getDb(project?: string): Database.Database {
  const projectSlug = getProjectSlug(project);
  if (dbCache.has(projectSlug)) {
    return dbCache.get(projectSlug)!;
  }

  const root = resolveProjectRoot();
  const baseDir = getBaseDir(root);
  const projectDbDir = path.join(baseDir, projectSlug);

  // Ensure directories exist
  if (!fs.existsSync(projectDbDir)) {
    fs.mkdirSync(projectDbDir, { recursive: true });
  }

  const dbPath = path.join(projectDbDir, 'graph.db');
  logger.info(`Connecting to database for project "${projectSlug}" at: ${dbPath}`);

  const db = new Database(dbPath);

  // WAL mode and busy timeout
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  initializeSchema(db);

  dbCache.set(projectSlug, db);
  return db;
}

export function closeAllDbs(): void {
  for (const [slug, db] of dbCache.entries()) {
    try {
      db.close();
      logger.info(`Closed database for project "${slug}"`);
    } catch (err) {
      logger.error(`Error closing database for project "${slug}":`, err);
    }
  }
  dbCache.clear();
}

interface Migration {
  version: number;
  up: (db: Database.Database) => void;
}

// Define incremental database migrations here
const migrations: Migration[] = [
  // Version 1 is the baseline schema setup. If new tables/columns are needed, increment version.
  {
    version: 1,
    up: (db) => {
      // Baseline schema (was previously created, this is now migration v1)
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
  }
];

function initializeSchema(db: Database.Database): void {
  // Check if schema_meta exists
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'
  `).get();

  let currentVersion = 0;

  if (!tableExists) {
    db.transaction(() => {
      db.prepare(`
        CREATE TABLE schema_meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `).run();

      db.prepare(`
        INSERT INTO schema_meta (key, value) VALUES ('version', '0')
      `).run();
    })();
  } else {
    const versionRow = db.prepare(`
      SELECT value FROM schema_meta WHERE key = 'version'
    `).get() as any;
    currentVersion = versionRow ? parseInt(versionRow.value, 10) : 0;
  }

  // Sort migrations and run pending ones
  const pendingMigrations = migrations
    .filter(m => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  if (pendingMigrations.length > 0) {
    db.transaction(() => {
      for (const migration of pendingMigrations) {
        logger.info(`Running database migration version ${migration.version}...`);
        migration.up(db);
        db.prepare(`
          UPDATE schema_meta SET value = ? WHERE key = 'version'
        `).run(migration.version.toString());
        currentVersion = migration.version;
      }
      logger.info(`Database schema is up to date at version ${currentVersion}`);
    })();
  }
}
