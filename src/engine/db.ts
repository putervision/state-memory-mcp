import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { logger } from '../utils/logger.js';
import { DatabaseError } from '../utils/errors.js';
import { loadProjectConfig } from './config.js';

const REGISTRY_PATH = path.join(os.homedir(), '.state-graph-mcp-registry.json');

function getRegistry(): Record<string, string> {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
      return JSON.parse(raw) || {};
    }
  } catch (e) {
    logger.warn('Failed to read or parse global registry:', e);
  }
  return {};
}

export function registerProject(name: string, projectPath: string): void {
  try {
    const registry = getRegistry();
    registry[name.toLowerCase()] = path.resolve(projectPath);
    const dir = path.dirname(REGISTRY_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
  } catch (e) {
    logger.error('Failed to register project in global registry:', e);
  }
}

export function getProjectFromRegistry(name: string): string | undefined {
  const registry = getRegistry();
  return registry[name.toLowerCase()];
}

// Resolve project root by walking up from CWD or using global registry
export function resolveProjectRoot(project?: string, cwd: string = process.cwd()): string {
  // 1. Try resolving via project parameter lookup in global registry
  if (project) {
    const registeredPath = getProjectFromRegistry(project);
    if (registeredPath && fs.existsSync(registeredPath)) {
      return registeredPath;
    }
  }

  const currentCwd = path.resolve(cwd);

  // 2. Check if current CWD is a subdirectory of any registered project path
  const registry = getRegistry();
  for (const [, projectPath] of Object.entries(registry)) {
    if (currentCwd === projectPath || currentCwd.startsWith(projectPath + path.sep)) {
      if (fs.existsSync(projectPath)) {
        return projectPath;
      }
    }
  }

  // 3. Fallback: walk up directory tree
  let current = currentCwd;
  while (true) {
    const isHome = current === os.homedir();
    const hasGit = fs.existsSync(path.join(current, '.git'));
    // Only count .state-graph-mcp if it is not the user's home directory
    const hasStateGraph = !isHome && fs.existsSync(path.join(current, '.state-graph-mcp'));

    if (hasGit || hasStateGraph) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break; // reached root directory
    }
    current = parent;
  }
  return currentCwd; // default to cwd if none found
}

// Get the base directory for storing state-graph-mcp databases
export function getBaseDir(projectRoot: string): string {
  const config = loadProjectConfig(projectRoot);
  if (config.storagePath) {
    return path.resolve(projectRoot, config.storagePath);
  }
  if (process.env.STATE_GRAPH_MCP_DIR) {
    return path.resolve(process.env.STATE_GRAPH_MCP_DIR);
  }
  // Default to project-local .state-graph-mcp directory
  return path.join(projectRoot, '.state-graph-mcp');
}

// Resolve project slug
export function getProjectSlug(project?: string): string {
  if (project && project.trim() !== '') {
    // Sanitize project name to be a safe slug (alphanumeric, dashes, underscores)
    return project.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  }
  const root = resolveProjectRoot(project);

  // Guard against using the home directory as a project root fallback
  if (root === os.homedir()) {
    const registry = getRegistry();
    const isRegistered = Object.values(registry).includes(root);
    if (!isRegistered) {
      throw new DatabaseError(
        `Could not auto-detect project name. You are running in or resolved to the home directory "${root}", which is not registered as a state-graph-mcp project.\n` +
        `Please specify the "project" parameter. Registered projects: ${Object.keys(registry).join(', ')}`
      );
    }
  }

  const config = loadProjectConfig(root);
  if (config.projectName) {
    return config.projectName.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  }
  return path.basename(root).toLowerCase().replace(/[^a-z0-9-_]/g, '-');
}

// Get the directory where a project's database is stored
export function getProjectDbDir(project?: string): string {
  const root = resolveProjectRoot(project);
  
  // Enforce that state-graph-mcp init must have been run (unless overridden by env var or in a test environment)
  if (!process.env.STATE_GRAPH_MCP_DIR && process.env.NODE_ENV !== 'test') {
    const localDir = path.join(root, '.state-graph-mcp');
    const isHomeDir = root === os.homedir();
    
    let isInitialized = fs.existsSync(localDir);
    if (isHomeDir) {
      // Home directory .state-graph-mcp is the global fallback folder,
      // so we only count it as initialized if it was explicitly registered as a project.
      const registry = getRegistry();
      const isRegistered = Object.values(registry).includes(root);
      if (!isRegistered) {
        isInitialized = false;
      }
    }

    if (!isInitialized) {
      throw new DatabaseError(`Project "${path.basename(root)}" is not initialized. Please run "state-graph-mcp init" in the project root first.`);
    }
  }

  const baseDir = getBaseDir(root);
  const projectSlug = getProjectSlug(project);
  const targetDir = path.resolve(path.join(baseDir, projectSlug));

  // Verify that the resolved target directory is inside the allowed baseDir to prevent path traversal
  const relative = path.relative(baseDir, targetDir);
  const isSafe = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  if (!isSafe) {
    throw new DatabaseError(`Path traversal detected: target directory "${targetDir}" is outside allowed base directory "${baseDir}"`);
  }

  return targetDir;
}

// Get the absolute path to the project's SQLite database file
export function getDbPath(project?: string): string {
  return path.join(getProjectDbDir(project), 'graph.db');
}

import { migrations } from './migrations.js';

const MAX_CACHED_DBS = 5;
const dbCache = new Map<string, { db: Database.Database; lastUsed: number }>();

export function getDb(project?: string): Database.Database {
  const projectSlug = getProjectSlug(project);
  const cached = dbCache.get(projectSlug);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.db;
  }

  // Enforce connection cache limit
  if (dbCache.size >= MAX_CACHED_DBS) {
    let oldestSlug: string | null = null;
    let oldestTime = Infinity;
    for (const [slug, item] of dbCache.entries()) {
      if (item.lastUsed < oldestTime) {
        oldestTime = item.lastUsed;
        oldestSlug = slug;
      }
    }
    if (oldestSlug) {
      logger.info(`Evicting database connection for project "${oldestSlug}" from cache due to limit.`);
      closeDb(oldestSlug);
    }
  }

  const projectDbDir = getProjectDbDir(project);

  // Ensure directories exist
  if (!fs.existsSync(projectDbDir)) {
    fs.mkdirSync(projectDbDir, { recursive: true });
  }

  const dbPath = getDbPath(project);
  logger.info(`Connecting to database for project "${projectSlug}" at: ${dbPath}`);

  const db = new Database(dbPath);

  // WAL mode and busy timeout
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  initializeSchema(db);

  dbCache.set(projectSlug, { db, lastUsed: Date.now() });
  return db;
}

export function closeDb(project?: string): void {
  const projectSlug = getProjectSlug(project);
  const cached = dbCache.get(projectSlug);
  if (cached) {
    try {
      cached.db.close();
      logger.info(`Closed database for project "${projectSlug}"`);
    } catch (err) {
      logger.error(`Error closing database for project "${projectSlug}":`, err);
    }
    dbCache.delete(projectSlug);
  }
}

export function closeAllDbs(): void {
  for (const [slug, cached] of dbCache.entries()) {
    try {
      cached.db.close();
      logger.info(`Closed database for project "${slug}"`);
    } catch (err) {
      logger.error(`Error closing database for project "${slug}":`, err);
    }
  }
  dbCache.clear();
}

export function getMetaValue(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM schema_meta WHERE key = ?').get(key);
  return row ? (row as { value: string }).value : null;
}

export function setMetaValue(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)').run(key, value);
}

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
