import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { backupProjectDb, restoreProjectDb } from '../../src/engine/backup.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';
import { ValidationError } from '../../src/utils/errors.js';

describe('Backup & Restore Checksum Verification', () => {
  const project = 'backup-checksum-test-project';

  afterAll(() => {
    closeAllDbs();
  });

  it('should backup project database and create .sha256 checksum file', async () => {
    getDb(project);
    const backupsDir = path.join(process.cwd(), '.state-memory-mcp', project, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });

    const backupPath = path.join(backupsDir, `test-backup-${Date.now()}.db`);
    const createdPath = await backupProjectDb({ project, outputPath: backupPath });

    expect(fs.existsSync(createdPath)).toBe(true);
    expect(fs.existsSync(`${createdPath}.sha256`)).toBe(true);

    // Verify restore succeeds with valid checksum
    expect(() => restoreProjectDb({ project, backupPath: createdPath })).not.toThrow();

    // Corrupt the sha256 checksum and verify restore fails
    fs.writeFileSync(`${createdPath}.sha256`, 'corrupted-sha256-hash-value');
    expect(() => restoreProjectDb({ project, backupPath: createdPath })).toThrow(ValidationError);

    fs.rmSync(backupsDir, { recursive: true, force: true });
  });

  it('should throw ValidationError if backup file is not a valid SQLite database', () => {
    const invalidDbFile = path.join(os.tmpdir(), `invalid-sqlite-${Date.now()}.db`);
    fs.writeFileSync(invalidDbFile, 'Not a sqlite database content');

    expect(() => restoreProjectDb({ project, backupPath: invalidDbFile })).toThrow(ValidationError);

    fs.unlinkSync(invalidDbFile);
  });
});
