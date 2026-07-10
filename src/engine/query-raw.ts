import Database from 'better-sqlite3';
import * as fs from 'fs';
import { getDbPath } from './db.js';
import { ValidationError, DatabaseError } from '../utils/errors.js';

/**
 * Run safe raw SELECT SQL queries against the database using a read-only connection.
 */
export function queryGraph(params: { project?: string; sql: string; params?: any[] }): any[] {
  // Case-insensitive blocklist check for dangerous SQLite functions/keywords using word boundaries
  const forbiddenPattern =
    /\b(load_extension|writefile|readfile|attach|detach|fts3_tokenizer|pragma)\b/i;
  const match = params.sql.match(forbiddenPattern);
  if (match) {
    throw new ValidationError(`SQL query contains forbidden keyword/function: ${match[1]}`);
  }

  const dbPath = getDbPath(params.project);

  if (!fs.existsSync(dbPath)) {
    throw new ValidationError(`Database file not found at: ${dbPath}`);
  }

  // Open with readonly: true to enforce read-only access
  const readOnlyDb = new Database(dbPath, { readonly: true });

  try {
    readOnlyDb.pragma('busy_timeout = 5000');

    let stmt;
    try {
      stmt = readOnlyDb.prepare(params.sql);
    } catch (err: any) {
      throw new DatabaseError(`SQL compilation failed: ${err.message}`);
    }

    if (!stmt.reader) {
      throw new ValidationError(
        'Write operations (INSERT, UPDATE, DELETE, DROP, etc.) are strictly prohibited.'
      );
    }

    const rows = stmt.all(...(params.params || []));
    // Hard cap at 500 rows to optimize context tokens
    return rows.slice(0, 500);
  } finally {
    readOnlyDb.close();
  }
}
