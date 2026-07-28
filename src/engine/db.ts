import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';
import { DatabaseError, ValidationError } from '../utils/errors.js';
import { loadProjectConfig } from './config.js';

/**
 * Validates a file path to ensure it resolves within the project root, preventing path traversal.
 *
 * @param filePath - The file path to validate.
 * @param project - Optional project identifier.
 * @returns The resolved absolute file path if safe.
 * @throws {ValidationError} If path traversal outside the project root is detected.
 */
import { validatePath as validatePathCore, loadPathConfig } from '../utils/path-validator.js';

/**
 * Validates a file path to ensure it resolves within allowed directories, preventing path traversal.
 *
 * @param filePath - The file path to validate.
 * @param project - Optional project identifier.
 * @returns The resolved absolute file path if safe.
 * @throws {ValidationError} If path traversal outside project root is detected.
 */
export function validatePath(filePath: string, project?: string): string {
  const projectRoot = resolveProjectRoot(project);
  const pathConfig = loadPathConfig(projectRoot);
  return validatePathCore(filePath, pathConfig);
}

const REGISTRY_PATH = path.join(os.homedir(), '.state-memory-mcp-registry.json');

let registryCache: { registry: Record<string, string>; timestamp: number } | null = null;
const REGISTRY_TTL_MS = 2000; // 2 seconds TTL

function getRegistry(): Record<string, string> {
  const now = Date.now();
  if (registryCache && now - registryCache.timestamp < REGISTRY_TTL_MS) {
    return registryCache.registry;
  }

  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
      try {
        const registry = JSON.parse(raw) || {};
        registryCache = { registry, timestamp: now };
        return registry;
      } catch (parseErr) {
        logger.error('Corrupt registry file detected at:', REGISTRY_PATH, parseErr);
        throw new DatabaseError(
          `Registry file exists at "${REGISTRY_PATH}" but contains invalid JSON. Fix or remove it manually to prevent overwriting registered projects.`
        );
      }
    }
  } catch (e) {
    if (e instanceof DatabaseError) throw e;
    logger.warn('Failed to read global registry:', e);
  }
  return {};
}

/**
 * Registers a project name and path in the global state-memory-mcp registry.
 *
 * @param name - The name of the project.
 * @param projectPath - The local path to the project root directory.
 * @returns void
 */
export function registerProject(name: string, projectPath: string): void {
  try {
    const resolvedPath = path.resolve(projectPath);
    if (resolvedPath === os.homedir()) {
      return; // Never register home directory as a project root
    }
    registryCache = null; // Invalidate cache
    const registry = getRegistry();
    registry[name.toLowerCase()] = resolvedPath;
    const dir = path.dirname(REGISTRY_PATH);
    fs.mkdirSync(dir, { recursive: true });

    // Atomic write with Owner-only read/write permissions (0o600)
    const tempPath = `${REGISTRY_PATH}.tmp.${Math.random().toString(36).substring(2)}`;
    fs.writeFileSync(tempPath, JSON.stringify(registry, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
    fs.renameSync(tempPath, REGISTRY_PATH);
  } catch (e) {
    logger.error('Failed to register project in global registry:', e);
  }
}

/**
 * Retrieves a registered project's path from the global registry.
 *
 * @param name - The name of the project.
 * @returns The registered project path, or undefined if not registered.
 */
export function getProjectFromRegistry(name: string): string | undefined {
  const registry = getRegistry();
  return registry[name.toLowerCase()];
}

/**
 * Resolves the project root directory path.
 * Priority order:
 * 1. Registered path matching explicit `project` name parameter.
 * 2. Longest registered project path that is a parent of `cwd` (excluding homedir).
 * 3. Nearest ancestor directory containing `.git` or `.state-memory-mcp`.
 * 4. Fallback to `cwd`.
 *
 * @param project - Optional project identifier.
 * @param cwd - The working directory to resolve from (defaults to process.cwd()).
 * @returns The resolved absolute project root path.
 */
export function resolveProjectRoot(project?: string, cwd: string = process.cwd()): string {
  // 1. Try resolving via project parameter lookup in global registry
  if (project) {
    const registeredPath = getProjectFromRegistry(project);
    if (registeredPath && fs.existsSync(registeredPath)) {
      return registeredPath;
    }
  }

  const currentCwd = path.resolve(cwd);

  // 2. Check if current CWD is a subdirectory of any registered project path (excluding homedir)
  const registry = getRegistry();
  let bestMatch: string | undefined;
  for (const [, projectPath] of Object.entries(registry)) {
    const resolvedPath = path.resolve(projectPath);
    if (resolvedPath === os.homedir()) continue;
    if (currentCwd === resolvedPath || currentCwd.startsWith(resolvedPath + path.sep)) {
      if (fs.existsSync(resolvedPath)) {
        if (!bestMatch || resolvedPath.length > bestMatch.length) {
          bestMatch = resolvedPath;
        }
      }
    }
  }
  if (bestMatch) {
    return bestMatch;
  }

  // 3. Fallback: walk up directory tree
  let current = currentCwd;
  while (true) {
    const isHome = current === os.homedir();
    const hasGit = fs.existsSync(path.join(current, '.git'));
    // Only count .state-memory-mcp if it is not the user's home directory
    const hasStateMemory = !isHome && fs.existsSync(path.join(current, '.state-memory-mcp'));

    if (hasGit || hasStateMemory) {
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

// Get the base directory for storing state-memory-mcp databases
/**
 * Gets the base directory for storing state-memory-mcp database files.
 *
 * @param projectRoot - The absolute path to the project root.
 * @returns The resolved directory path where databases are stored.
 */
export function getBaseDir(projectRoot: string): string {
  const config = loadProjectConfig(projectRoot);
  if (config.storagePath) {
    return path.resolve(projectRoot, config.storagePath);
  }
  if (process.env.STATE_MEMORY_MCP_DIR) {
    return path.resolve(process.env.STATE_MEMORY_MCP_DIR);
  }
  // Default to project-local .state-memory-mcp directory
  return path.join(projectRoot, '.state-memory-mcp');
}

// Resolve project slug
/**
 * Resolves and sanitizes a project identifier into a safe database slug.
 *
 * @param project - Optional project identifier.
 * @returns The sanitized project slug containing only alphanumeric characters, dashes, and underscores.
 * @throws {DatabaseError} If the project name cannot be auto-detected because it resolves to the home directory.
 */
export function getProjectSlug(project?: string): string {
  if (project && project.trim() !== '') {
    // Sanitize project name to be a safe slug (alphanumeric, dashes, underscores)
    return project
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  const root = resolveProjectRoot(project);

  // Guard against using the home directory as a project root fallback
  if (root === os.homedir()) {
    const registry = getRegistry();
    const isRegistered = Object.values(registry).includes(root);
    if (!isRegistered) {
      throw new DatabaseError(
        `Could not auto-detect project name. You are running in or resolved to the home directory "${root}", which is not registered as a state-memory-mcp project.\n` +
          `Please specify the "project" parameter. Registered projects: ${Object.keys(registry).join(', ')}`
      );
    }
  }

  const config = loadProjectConfig(root);
  let name = '';
  if (config.projectName) {
    name = config.projectName;
  } else {
    name = path.basename(root);
  }

  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Get the directory where a project's database is stored
/**
 * Gets the directory where the project's SQLite database is stored.
 *
 * @param project - Optional project identifier.
 * @returns The absolute path to the project's database folder.
 * @throws {DatabaseError} If the project is not initialized or path traversal is detected.
 */
export function getProjectDbDir(project?: string): string {
  const root = resolveProjectRoot(project);

  // Enforce that state-memory-mcp init must have been run (unless overridden by env var or in a test environment)
  if (!process.env.STATE_MEMORY_MCP_DIR && process.env.NODE_ENV !== 'test') {
    const localDir = path.join(root, '.state-memory-mcp');
    const isHomeDir = root === os.homedir();

    let isInitialized = fs.existsSync(localDir);
    if (isHomeDir) {
      // Home directory .state-memory-mcp is the global fallback folder,
      // so we only count it as initialized if it was explicitly registered as a project.
      const registry = getRegistry();
      const isRegistered = Object.values(registry).includes(root);
      if (!isRegistered) {
        isInitialized = false;
      }
    }

    if (!isInitialized) {
      throw new DatabaseError(
        `Project "${path.basename(root)}" is not initialized. Please run "state-memory-mcp init" in the project root first.`
      );
    }
  }

  const baseDir = getBaseDir(root);
  const projectSlug = getProjectSlug(project);
  const targetDir = path.resolve(path.join(baseDir, projectSlug));

  // Verify that the resolved target directory is inside the allowed baseDir to prevent path traversal
  const relative = path.relative(baseDir, targetDir);
  const isSafe = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  if (!isSafe) {
    throw new DatabaseError(
      `Path traversal detected: target directory "${targetDir}" is outside allowed base directory "${baseDir}"`
    );
  }

  return targetDir;
}

// Get the absolute path to the project's SQLite database file
/**
 * Gets the absolute path to the project's SQLite database file.
 *
 * @param project - Optional project identifier.
 * @returns The absolute path to the project's graph.db file.
 */
export function getDbPath(project?: string): string {
  return path.join(getProjectDbDir(project), 'graph.db');
}

import { migrations } from './migrations.js';

const MAX_CACHED_DBS = 5;
const dbCache = new Map<string, { db: Database.Database; lastUsed: number }>();
const readOnlyDbCache = new Map<string, { db: Database.Database; lastUsed: number }>();

export function getEncryptionKey(projectRoot?: string): Buffer | null {
  const keyStr =
    process.env.STATE_MEMORY_ENCRYPTION_KEY ||
    (projectRoot ? loadProjectConfig(projectRoot).encryptionKey : undefined);
  if (!keyStr) return null;
  return crypto.createHash('sha256').update(keyStr).digest();
}

export function encryptPayload(dataStr: string, projectRoot?: string): string {
  const key = getEncryptionKey(projectRoot);
  if (!key) return dataStr;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(dataStr, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `ENC:${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err: any) {
    logger.warn(`Failed to encrypt payload: ${err.message}`);
    return dataStr;
  }
}

export function decryptPayload(dataStr: string, projectRoot?: string): string {
  if (!dataStr || !dataStr.startsWith('ENC:')) return dataStr;
  const key = getEncryptionKey(projectRoot);
  if (!key) return dataStr;
  try {
    const parts = dataStr.split(':');
    if (parts.length !== 4) return dataStr;
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const encryptedText = parts[3];
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    logger.warn(`Failed to decrypt payload: ${err.message}`);
    return dataStr;
  }
}

export function checkDatabaseSizeLimit(db: Database.Database, projectRoot: string): void {
  try {
    const config = loadProjectConfig(projectRoot);
    const maxBytes =
      config.maxDatabaseSizeBytes ||
      parseInt(process.env.STATE_MEMORY_MAX_DB_BYTES || '104857600', 10);
    const pageCount = (db.prepare('PRAGMA page_count').get() as any)?.page_count || 0;
    const pageSize = (db.prepare('PRAGMA page_size').get() as any)?.page_size || 4096;
    const dbSizeBytes = pageCount * pageSize;

    if (dbSizeBytes > maxBytes * 0.8) {
      logger.warn(
        `[WARN] Database size threshold reached: ${(dbSizeBytes / 1024 / 1024).toFixed(2)}MB / ${(maxBytes / 1024 / 1024).toFixed(2)}MB (${((dbSizeBytes / maxBytes) * 100).toFixed(1)}%). Consider running VACUUM or pruning events.`
      );
    }

    if (config.autoVacuumThresholdBytes && dbSizeBytes > config.autoVacuumThresholdBytes) {
      logger.info('Auto-vacuum threshold reached: executing PRAGMA incremental_vacuum...');
      db.pragma('incremental_vacuum(100)');
    }
  } catch (err: any) {
    logger.debug(`Could not check database size limit: ${err.message}`);
  }
}

/**
 * Opens or retrieves a cached better-sqlite3 database connection for the given project, performing migrations if needed.
 *
 * @param project - Optional project identifier.
 * @returns The active better-sqlite3 Database instance.
 */
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
      logger.info(
        `Evicting database connection for project "${oldestSlug}" from cache due to limit.`
      );
      closeDb(oldestSlug);
    }
  }

  const projectDbDir = getProjectDbDir(project);

  // Ensure directories exist with restricted permissions
  if (!fs.existsSync(projectDbDir)) {
    fs.mkdirSync(projectDbDir, { recursive: true, mode: 0o700 });
  }
  try {
    fs.chmodSync(projectDbDir, 0o700);
  } catch {
    // Ignore permissions errors on non-posix systems
  }

  const dbPath = getDbPath(project);
  logger.info(`Connecting to database for project "${projectSlug}" at: ${dbPath}`);

  const db = new Database(dbPath);
  try {
    if (fs.existsSync(dbPath)) {
      fs.chmodSync(dbPath, 0o600);
    }
  } catch {
    // Ignore permissions errors on non-posix systems
  }

  const projectRoot = resolveProjectRoot(project);
  const config = loadProjectConfig(projectRoot);
  const busyTimeout =
    config.busyTimeoutMs || parseInt(process.env.STATE_MEMORY_BUSY_TIMEOUT || '5000', 10);
  const journalMode = process.env.STATE_MEMORY_WAL_MODE || 'WAL';

  // WAL mode, synchronous mode, and busy timeout
  db.pragma(`journal_mode = ${journalMode}`);
  db.pragma('synchronous = NORMAL');
  db.pragma(`busy_timeout = ${busyTimeout}`);
  db.pragma('foreign_keys = ON');

  // Initialize schema
  initializeSchema(db);
  checkDatabaseSizeLimit(db, projectRoot);

  dbCache.set(projectSlug, { db, lastUsed: Date.now() });
  return db;
}

/**
 * Opens or retrieves a cached read-only better-sqlite3 database connection for the given project.
 * Enforces busy_timeout and load_extension security policies.
 *
 * @param project - Optional project identifier.
 * @returns The active read-only better-sqlite3 Database instance.
 */
export function getReadOnlyDb(project?: string): Database.Database {
  const projectSlug = getProjectSlug(project);
  const cached = readOnlyDbCache.get(projectSlug);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.db;
  }

  // Enforce read-only connection cache limit
  if (readOnlyDbCache.size >= MAX_CACHED_DBS) {
    let oldestSlug: string | null = null;
    let oldestTime = Infinity;
    for (const [slug, item] of readOnlyDbCache.entries()) {
      if (item.lastUsed < oldestTime) {
        oldestTime = item.lastUsed;
        oldestSlug = slug;
      }
    }
    if (oldestSlug) {
      const roCached = readOnlyDbCache.get(oldestSlug);
      if (roCached) {
        try {
          roCached.db.close();
        } catch {
          // Ignore close errors during cache eviction
        }
        readOnlyDbCache.delete(oldestSlug);
      }
    }
  }

  const dbPath = getDbPath(project);
  if (!fs.existsSync(dbPath)) {
    throw new ValidationError(`Database file not found at: ${dbPath}`);
  }

  const db = new Database(dbPath, { readonly: true });
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.pragma('enable_load_extension = 0');

  readOnlyDbCache.set(projectSlug, { db, lastUsed: Date.now() });
  return db;
}

/**
 * Closes the cached database connection for a specific project.
 *
 * @param project - Optional project identifier.
 * @returns void
 */
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

  const roCached = readOnlyDbCache.get(projectSlug);
  if (roCached) {
    try {
      roCached.db.close();
      logger.info(`Closed read-only database for project "${projectSlug}"`);
    } catch (err) {
      logger.error(`Error closing read-only database for project "${projectSlug}":`, err);
    }
    readOnlyDbCache.delete(projectSlug);
  }
}

/**
 * Closes all active and cached database connections.
 *
 * @returns void
 */
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

  for (const [slug, cached] of readOnlyDbCache.entries()) {
    try {
      cached.db.close();
      logger.info(`Closed read-only database for project "${slug}"`);
    } catch (err) {
      logger.error(`Error closing read-only database for project "${slug}":`, err);
    }
  }
  readOnlyDbCache.clear();
}

/**
 * Retrieves a metadata value from the database's schema_meta table.
 *
 * @param db - The better-sqlite3 Database connection.
 * @param key - The metadata key.
 * @returns The metadata value or null if not found.
 */
export function getMetaValue(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM schema_meta WHERE key = ?').get(key);
  return row ? (row as { value: string }).value : null;
}

/**
 * Inserts or replaces a metadata key-value pair in the database's schema_meta table.
 *
 * @param db - The better-sqlite3 Database connection.
 * @param key - The metadata key.
 * @param value - The metadata value.
 * @returns void
 */
export function setMetaValue(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)').run(key, value);
}

function initializeSchema(db: Database.Database): void {
  // Check if schema_meta exists
  const tableExists = db
    .prepare(
      `
    SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'
  `
    )
    .get();

  let currentVersion = 0;

  if (!tableExists) {
    db.transaction(() => {
      db.prepare(
        `
        CREATE TABLE schema_meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `
      ).run();

      db.prepare(
        `
        INSERT INTO schema_meta (key, value) VALUES ('version', '0')
      `
      ).run();
    })();
  } else {
    const versionRow = db
      .prepare(
        `
      SELECT value FROM schema_meta WHERE key = 'version'
    `
      )
      .get() as any;
    currentVersion = versionRow ? parseInt(versionRow.value, 10) : 0;
  }

  // Sort migrations and run pending ones
  const pendingMigrations = migrations
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  if (pendingMigrations.length > 0) {
    for (const migration of pendingMigrations) {
      db.transaction(() => {
        logger.info(`Running database migration version ${migration.version}...`);
        migration.up(db);
        db.prepare(
          `
          UPDATE schema_meta SET value = ? WHERE key = 'version'
        `
        ).run(migration.version.toString());
      })();
      currentVersion = migration.version;
    }
    logger.info(`Database schema is up to date at version ${currentVersion}`);
  }
}
