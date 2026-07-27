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

  // Ignore string literal contents (single and double quotes) when checking for prohibited semicolons
  const sqlWithoutStrings = cleanSql
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""');
  if (sqlWithoutStrings.includes(';')) {
    throw new ValidationError('Multi-statement queries are prohibited.');
  }

  // Pre-filter with regex and prefix check (defense-in-depth / test compatibility)
  const cleanSqlUpper = cleanSql.toUpperCase().trim();
  const startsWithSelect = cleanSqlUpper.startsWith('SELECT') || cleanSqlUpper.startsWith('WITH');
  if (!startsWithSelect) {
    throw new ValidationError(
      'Write operations (INSERT, UPDATE, DELETE, DROP, etc.) are strictly prohibited.'
    );
  }

  const forbiddenPattern =
    /\b(load_extension|writefile|readfile|attach|detach|fts3_tokenizer|pragma|sqlite_master|sqlite_schema)\b/i;
  const match = cleanSql.match(forbiddenPattern);
  if (match) {
    throw new ValidationError(`SQL query contains forbidden keyword/function: ${match[1]}`);
  }

  // Tokenizer AST Allow-list check: target tables must belong to allowed list
  const ALLOWED_TABLES = new Set([
    'nodes',
    'edges',
    'sessions',
    'events',
    'snapshots',
    'nodes_fts',
    'schema_meta',
  ]);

  // Extract table names following FROM and JOIN (strip string literals)
  const fromJoinMatches = sqlWithoutStrings.matchAll(/\b(?:FROM|JOIN)\s+([a-zA-Z0-9_]+)/gi);
  for (const m of fromJoinMatches) {
    const tableName = m[1].toLowerCase();
    // Ignore subqueries (e.g. FROM (SELECT ...))
    if (tableName !== 'select' && tableName !== 'with' && !ALLOWED_TABLES.has(tableName)) {
      throw new ValidationError(
        `Access to table or subquery alias "${tableName}" is not allowed in query_graph.`
      );
    }
  }

  // Enforce a row limit at the SQLite engine level (default 500)
  const rowLimit = params.limit ?? 500;
  const wrappedSql = cleanSqlUpper.startsWith('WITH')
    ? `${cleanSql} LIMIT ?`
    : `SELECT * FROM (${cleanSql}) LIMIT ?`;
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
