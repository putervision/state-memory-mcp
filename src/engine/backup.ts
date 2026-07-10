import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { getDb, getDbPath, getProjectDbDir, getProjectSlug, closeDb, validatePath } from './db.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Safely back up the SQLite database file for a project
 */
export async function backupProjectDb(params: {
  project?: string;
  outputPath?: string;
}): Promise<string> {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

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
  } else {
    targetPath = validatePath(targetPath, params.project);
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  }

  logger.info(`Starting online database backup for project "${projectSlug}" to: ${targetPath}`);
  await db.backup(targetPath);

  // Calculate SHA-256 hash and write it to targetPath.sha256
  try {
    const fileBuffer = fs.readFileSync(targetPath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
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
  const dbPath = getDbPath(params.project);
  const resolvedBackupPath = validatePath(params.backupPath, params.project);

  if (!fs.existsSync(resolvedBackupPath)) {
    throw new ValidationError(`Backup file not found: ${resolvedBackupPath}`);
  }

  // 1. Verify SHA-256 checksum if .sha256 file exists
  const checksumPath = `${resolvedBackupPath}.sha256`;
  if (fs.existsSync(checksumPath)) {
    try {
      const expectedHash = fs.readFileSync(checksumPath, 'utf-8').trim();
      const fileBuffer = fs.readFileSync(resolvedBackupPath);
      const actualHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
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
  try {
    const tempDb = new Database(resolvedBackupPath, { readonly: true });
    const check = tempDb.pragma('integrity_check') as any[];

    const isOk =
      Array.isArray(check) &&
      check.length === 1 &&
      (check[0] === 'ok' || check[0]?.integrity_check === 'ok');
    if (!isOk) {
      tempDb.close();
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

    tempDb.close();

    if (!schemaMetaExists || !nodesExists || !edgesExists) {
      throw new ValidationError(
        "Backup database is missing required state-memory-mcp tables ('schema_meta', 'nodes', or 'edges')."
      );
    }
  } catch (err: any) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError(`Invalid state-memory-mcp backup database file: ${err.message}`);
  }

  // 3. Close active connection
  closeDb(params.project);

  // 4. Clear WAL and shm files if they exist
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

  // 5. Overwrite DB file
  fs.copyFileSync(resolvedBackupPath, dbPath);

  // 6. Re-open/initialize database
  getDb(params.project);
  logger.info(`Database restored successfully from: ${resolvedBackupPath}`);
}
