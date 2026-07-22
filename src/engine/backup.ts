import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import {
  getDb,
  getDbPath,
  getProjectDbDir,
  getProjectSlug,
  closeDb,
  resolveProjectRoot,
} from './db.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { validatePath, loadPathConfig } from '../utils/path-validator.js';

/**
 * Helper to compute SHA-256 asynchronously via streams.
 */
function calculateSha256Async(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Helper to compute SHA-256 synchronously via chunked reads.
 */
function calculateSha256Sync(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.alloc(65536); // 64KB chunks
  const fd = fs.openSync(filePath, 'r');
  let bytesRead = 0;
  let position = 0;
  try {
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, position)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/**
 * Helper to check SQLite file magic bytes.
 */
function isValidSqliteFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    try {
      fs.readSync(fd, buffer, 0, 16, 0);
    } finally {
      fs.closeSync(fd);
    }
    return buffer.toString('ascii', 0, 15) === 'SQLite format 3' && buffer[15] === 0;
  } catch {
    return false;
  }
}

/**
 * Safely back up the SQLite database file for a project
 */
export async function backupProjectDb(params: {
  project?: string;
  outputPath?: string;
}): Promise<string> {
  const projectSlug = getProjectSlug(params.project);
  const projectRoot = resolveProjectRoot(params.project);
  const pathConfig = loadPathConfig(projectRoot);

  let targetPath = params.outputPath;
  if (!targetPath) {
    const dbDir = getProjectDbDir(params.project);
    const backupsDir = path.join(dbDir, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
    targetPath = path.join(backupsDir, `backup-${timestamp}.db`);
  }

  // Validate backup path
  targetPath = validatePath(targetPath, pathConfig);

  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const db = getDb(projectSlug);
  logger.info(`Starting online database backup for project "${projectSlug}" to: ${targetPath}`);
  await db.backup(targetPath);

  // Calculate SHA-256 hash using streaming and write it to targetPath.sha256
  try {
    const hash = await calculateSha256Async(targetPath);
    fs.writeFileSync(`${targetPath}.sha256`, hash, 'utf-8');
    logger.info(`Database backup SHA-256 hash written to: ${targetPath}.sha256`);
  } catch (err: any) {
    logger.warn(`Failed to write checksum file: ${err.message}`);
  }

  logger.info(`Database backup completed successfully for project "${projectSlug}"`);
  return targetPath;
}

/**
 * Restore database from backup
 */
export function restoreProjectDb(params: { backupPath: string; project?: string }): void {
  const projectRoot = resolveProjectRoot(params.project);
  const pathConfig = loadPathConfig(projectRoot);
  const dbPath = getDbPath(params.project);
  const resolvedBackupPath = validatePath(params.backupPath, { ...pathConfig, mustExist: true });

  if (!fs.existsSync(resolvedBackupPath)) {
    throw new ValidationError(`Backup file not found: ${resolvedBackupPath}`);
  }

  // Verify SQLite file magic bytes
  if (!isValidSqliteFile(resolvedBackupPath)) {
    throw new ValidationError(`Backup file is not a valid SQLite database: ${resolvedBackupPath}`);
  }

  // 1. Verify SHA-256 checksum if .sha256 file exists (using memory-efficient chunked read)
  const checksumPath = `${resolvedBackupPath}.sha256`;
  if (fs.existsSync(checksumPath)) {
    try {
      const expectedHash = fs.readFileSync(checksumPath, 'utf-8').trim();
      const actualHash = calculateSha256Sync(resolvedBackupPath);
      if (expectedHash !== actualHash) {
        throw new ValidationError(
          `Backup file integrity checksum mismatch. Expected: ${expectedHash}, Actual: ${actualHash}`
        );
      }
      logger.info('Backup file SHA-256 checksum verified successfully.');
    } catch (err: any) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError(`Failed to verify backup SHA-256 checksum: ${err.message}`);
    }
  } else {
    logger.warn(
      `No checksum file found at "${checksumPath}". Proceeding with SQLite integrity check only.`
    );
  }

  // 2. Verify structural soundness & schema of backup database
  let tempDb: Database.Database | undefined;
  try {
    tempDb = new Database(resolvedBackupPath, { readonly: true });
    const check = tempDb.pragma('integrity_check') as any[];

    const isOk =
      Array.isArray(check) &&
      check.length === 1 &&
      (check[0] === 'ok' || check[0]?.integrity_check === 'ok');
    if (!isOk) {
      throw new ValidationError(
        `Backup file SQLite integrity check failed: ${JSON.stringify(check)}`
      );
    }

    // Verify expected tables exist
    const schemaMetaExists = tempDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'")
      .get();
    const nodesExists = tempDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nodes'")
      .get();
    const edgesExists = tempDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='edges'")
      .get();

    if (!schemaMetaExists || !nodesExists || !edgesExists) {
      throw new ValidationError(
        "Backup database is missing required state-memory-mcp tables ('schema_meta', 'nodes', or 'edges')."
      );
    }
  } catch (err: any) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError(`Invalid state-memory-mcp backup database file: ${err.message}`);
  } finally {
    if (tempDb) {
      try {
        tempDb.close();
      } catch {
        // Ignore close error on cleanup
      }
    }
  }

  // 3. Close active connection before restoration to prevent write locks
  closeDb(params.project);

  // 4. Auto-create timestamped backup of current DB before overwriting
  if (fs.existsSync(dbPath)) {
    try {
      const dbDir = getProjectDbDir(params.project);
      const backupsDir = path.join(dbDir, 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }
      const now = new Date();
      const timestamp = now
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\..+/, '')
        .replace('T', '-');
      const autoBackupPath = path.join(backupsDir, `pre-restore-backup-${timestamp}.db`);
      fs.copyFileSync(dbPath, autoBackupPath);
      logger.info(`Auto-backup of current database created at: ${autoBackupPath}`);

      try {
        const autoHash = calculateSha256Sync(autoBackupPath);
        fs.writeFileSync(`${autoBackupPath}.sha256`, autoHash, 'utf-8');
      } catch (hashErr: any) {
        logger.warn(`Failed to write auto-backup checksum: ${hashErr.message}`);
      }
    } catch (backupErr: any) {
      logger.warn(`Failed to create pre-restore auto-backup: ${backupErr.message}`);
    }
  }

  // 5. Clear WAL and shm files if they exist
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

  // 6. Overwrite DB file
  fs.copyFileSync(resolvedBackupPath, dbPath);

  // 7. Re-open/initialize database
  getDb(params.project);
  logger.info(`Database restored successfully from: ${resolvedBackupPath}`);
}
