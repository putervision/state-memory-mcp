import { getReadOnlyDb } from './db.js';
import { ValidationError, DatabaseError } from '../utils/errors.js';

/**
 * Run safe raw SELECT SQL queries against the database using a read-only connection.
 */
export function queryGraph(params: {
  project?: string;
  sql: string;
  params?: any[];
  limit?: number;
}): unknown[] {
  const readOnlyDb = getReadOnlyDb(params.project);

  // Strip SQL comments before validation (defense-in-depth)
  let cleanSql = params.sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments → space
    .replace(/--.*$/gm, ' ') // line comments → space
    .trim();

  // Clean trailing semicolons to prevent syntax errors when wrapping
  if (cleanSql.endsWith(';')) {
    cleanSql = cleanSql.slice(0, -1).trim();
  }

  // Also reject embedded semicolons (multi-statement prevention)
  if (cleanSql.includes(';')) {
    throw new ValidationError('Multi-statement queries are prohibited.');
  }

  // Pre-filter with regex and prefix check (defense-in-depth / test compatibility)
  const cleanSqlUpper = cleanSql.toUpperCase();
  const startsWithSelect = cleanSqlUpper.startsWith('SELECT') || cleanSqlUpper.startsWith('WITH');
  if (!startsWithSelect) {
    throw new ValidationError(
      'Write operations (INSERT, UPDATE, DELETE, DROP, etc.) are strictly prohibited.'
    );
  }

  const forbiddenPattern =
    /\b(load_extension|writefile|readfile|attach|detach|fts3_tokenizer|pragma)\b/i;
  const match = cleanSql.match(forbiddenPattern);
  if (match) {
    throw new ValidationError(`SQL query contains forbidden keyword/function: ${match[1]}`);
  }

  // Enforce a row limit at the SQLite engine level (default 500)
  const rowLimit = params.limit ?? 500;
  const wrappedSql = `SELECT * FROM (${cleanSql}) LIMIT ?`;
  const sqlParams = [...(params.params || []), rowLimit];

  try {
    let stmt;
    try {
      stmt = readOnlyDb.prepare(wrappedSql);
    } catch (err: any) {
      throw new DatabaseError(`SQL compilation failed: ${err.message}`);
    }

    if (!stmt.reader) {
      throw new ValidationError(
        'Write operations (INSERT, UPDATE, DELETE, DROP, etc.) are strictly prohibited.'
      );
    }

    return stmt.all(...sqlParams);
  } catch (err: any) {
    if (err instanceof ValidationError || err instanceof DatabaseError) {
      throw err;
    }
    throw new DatabaseError(`SQL execution failed: ${err.message}`);
  }
}
