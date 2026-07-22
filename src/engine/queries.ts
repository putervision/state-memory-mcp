import { getDb, getProjectSlug } from './db.js';
import { BaseNode, Edge, NodeType, NodeRow, EdgeRow } from '../schema/types.js';
import { parseNodeRow, parseEdgeRow } from './row-mappers.js';
import { getCurrentBranch } from '../utils/git.js';
import { searchTfidf } from './tfidf.js';
import { logger } from '../utils/logger.js';

/**
 * Engine for querying nodes and subgraphs from the database.
 */
export class QueryEngine {
  /**
   * List nodes with advanced filtering and pagination.
   *
   * @param params - The list filtering and pagination parameters.
   * @param params.project - Optional project identifier.
   * @param params.type - Optional node type to filter by.
   * @param params.status - Optional status to filter by.
   * @param params.tags - Optional array of tags (AND matches).
   * @param params.limit - Optional maximum number of nodes to return.
   * @param params.offset - Optional offset for pagination.
   * @param params.compact - Optional. If true, metadata is excluded.
   * @param params.git_branch - Optional git branch filter.
   * @returns An object containing the list of matching nodes and the total count of matched nodes.
   */
  static listNodes(params: {
    project?: string;
    type?: NodeType;
    status?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
    compact?: boolean;
    git_branch?: string;
  }): { nodes: BaseNode[]; total_count: number } {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    const columns = params.compact
      ? 'id, type, title, status, project, git_branch, tags, created_at, updated_at'
      : '*';

    let sql = `SELECT ${columns} FROM nodes WHERE project = ?`;
    const queryParams: any[] = [projectSlug];

    // Branch filter: default to active branch, support '*' for all branches
    const branch = params.git_branch !== undefined ? params.git_branch : getCurrentBranch();
    if (branch !== '*') {
      sql += ' AND git_branch = ?';
      queryParams.push(branch);
    }

    if (params.type) {
      sql += ' AND type = ?';
      queryParams.push(params.type);
    }

    if (params.status) {
      sql += ' AND status = ?';
      queryParams.push(params.status);
    }

    // Tag filtering: match all provided tags (AND query) using json_each
    if (params.tags && params.tags.length > 0) {
      for (const tag of params.tags) {
        sql += ` AND EXISTS (
          SELECT 1 FROM json_each(nodes.tags) WHERE value = ?
        )`;
        queryParams.push(tag);
      }
    }

    const limit = params.limit !== undefined ? params.limit : 50;
    const offset = params.offset !== undefined ? params.offset : 0;

    // Apply pagination with limit + 1 to determine if there are more results
    const paginatedSql = sql + ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const paginatedParams = [...queryParams, limit + 1, offset];

    const rows = db.prepare(paginatedSql).all(...paginatedParams) as NodeRow[];

    let total_count = 0;
    let hasMore = false;

    if (rows.length > limit) {
      hasMore = true;
      rows.pop(); // Remove the extra row
    }

    if (hasMore) {
      // Run count query only when there are more results than the limit
      const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
      const countRow = db.prepare(countSql).get(...queryParams) as any;
      total_count = countRow ? countRow.total : 0;
    } else {
      total_count = offset + rows.length;
    }

    const nodes = rows.map(parseNodeRow);

    return { nodes, total_count };
  }

  /**
   * Search nodes using FTS5 virtual table or TF-IDF cosine similarity.
   *
   * @param params - The search parameters.
   * @param params.project - Optional project identifier.
   * @param params.query - The search query term.
   * @param params.type - Optional node type to filter results.
   * @param params.status - Optional status to filter results.
   * @param params.limit - Optional maximum number of results to return.
   * @param params.git_branch - Optional git branch filter.
   * @param params.algorithm - The search algorithm to use ('fts' or 'tfidf').
   * @returns An object containing matching nodes and the total count.
   */
  static searchNodes(params: {
    project?: string;
    query: string;
    type?: NodeType;
    status?: string;
    limit?: number;
    offset?: number;
    git_branch?: string;
    algorithm?: 'fts' | 'tfidf';
  }): { nodes: BaseNode[]; total_count: number } {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    if (params.algorithm === 'tfidf') {
      let sql = 'SELECT * FROM nodes WHERE project = ?';
      const queryParams: any[] = [projectSlug];

      const branch = params.git_branch !== undefined ? params.git_branch : getCurrentBranch();
      if (branch !== '*') {
        sql += ' AND git_branch = ?';
        queryParams.push(branch);
      }

      if (params.type) {
        sql += ' AND type = ?';
        queryParams.push(params.type);
      }

      if (params.status) {
        sql += ' AND status = ?';
        queryParams.push(params.status);
      }

      const MAX_TFIDF_CANDIDATES = 1000;
      sql += ` LIMIT ${MAX_TFIDF_CANDIDATES + 1}`;

      const rows = db.prepare(sql).all(...queryParams) as NodeRow[];
      if (rows.length > MAX_TFIDF_CANDIDATES) {
        logger.warn(
          `TF-IDF search candidate list truncated to ${MAX_TFIDF_CANDIDATES} nodes to prevent memory pressure.`
        );
        rows.pop();
      }

      const candidates = rows.map(parseNodeRow);

      const limit = params.limit !== undefined ? params.limit : 20;
      const offset = params.offset !== undefined ? params.offset : 0;

      // Get all matches from TF-IDF first, then paginate
      const matched = searchTfidf(candidates, params.query, candidates.length);
      const paginated = matched.slice(offset, offset + limit);

      return { nodes: paginated, total_count: matched.length };
    }

    // SQLite FTS5 query matching n.rowid to f.rowid
    const sanitizeFtsQuery = (q: string): string => {
      const trimmed = q.trim();
      if (!trimmed) return '""';
      return trimmed
        .split(/\s+/)
        .map((token) => `"${token.replace(/"/g, '""')}"`)
        .join(' ');
    };

    let ftsQuery = params.query;
    let sql = `
      SELECT n.* 
      FROM nodes n
      JOIN nodes_fts f ON n.rowid = f.rowid
      WHERE n.project = ? AND nodes_fts MATCH ?
    `;
    let queryParams: any[] = [projectSlug, ftsQuery];

    // Branch filter: default to active branch, support '*' for all branches
    const branch = params.git_branch !== undefined ? params.git_branch : getCurrentBranch();
    if (branch !== '*') {
      sql += ' AND n.git_branch = ?';
      queryParams.push(branch);
    }

    if (params.type) {
      sql += ' AND n.type = ?';
      queryParams.push(params.type);
    }

    if (params.status) {
      sql += ' AND n.status = ?';
      queryParams.push(params.status);
    }

    const limit = params.limit !== undefined ? params.limit : 20;
    const offset = params.offset !== undefined ? params.offset : 0;

    try {
      const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
      const countRow = db.prepare(countSql).get(...queryParams) as any;
      const total_count = countRow ? countRow.total : 0;

      const paginatedSql = sql + ' LIMIT ? OFFSET ?';
      const rows = db.prepare(paginatedSql).all(...queryParams, limit, offset) as NodeRow[];
      const nodes = rows.map(parseNodeRow);

      return { nodes, total_count };
    } catch (err: any) {
      logger.debug(
        `FTS search failed for query "${params.query}", retrying with sanitized FTS terms: ${err.message}`
      );
      // Retry with sanitized terms
      try {
        const sanitizedQuery = sanitizeFtsQuery(params.query);
        queryParams[1] = sanitizedQuery;
        const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
        const countRow = db.prepare(countSql).get(...queryParams) as any;
        const total_count = countRow ? countRow.total : 0;

        const paginatedSql = sql + ' LIMIT ? OFFSET ?';
        const rows = db.prepare(paginatedSql).all(...queryParams, limit, offset) as NodeRow[];
        const nodes = rows.map(parseNodeRow);

        return { nodes, total_count };
      } catch (retryErr: any) {
        logger.warn(
          `Sanitized FTS search failed, falling back to TF-IDF search: ${retryErr.message}`
        );
        return QueryEngine.searchNodes({ ...params, algorithm: 'tfidf' });
      }
    }
  }

  /**
   * Get recursive N-hop neighborhood of a root node.
   *
   * @param params - The subgraph query parameters.
   * @param params.project - Optional project identifier.
   * @param params.root_id - The root node ID to traverse from.
   * @param params.depth - The traversal depth limit.
   * @param params.edge_types - Optional array of edge types to follow.
   * @param params.node_types - Optional array of node types to include in results.
   * @returns An object containing nodes and edges within the subgraph.
   */
  static getSubgraph(params: {
    project?: string;
    root_id: string;
    depth?: number;
    edge_types?: string[];
    node_types?: string[];
  }): { nodes: BaseNode[]; edges: Edge[] } {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    const depth = params.depth !== undefined ? params.depth : 2;

    // Verify root node exists
    const rootExists = db.prepare('SELECT 1 FROM nodes WHERE id = ?').get(params.root_id);
    if (!rootExists) {
      throw new Error(`Root node not found: ${params.root_id}`);
    }

    let edgeTypeFilter = '';
    const recursiveParams: any[] = [params.root_id, params.root_id, depth];

    if (params.edge_types && params.edge_types.length > 0) {
      const placeholders = params.edge_types.map(() => '?').join(',');
      edgeTypeFilter = `AND e.type IN (${placeholders})`;
      recursiveParams.push(...params.edge_types);
    }

    // Recursive CTE to gather node IDs in N hops, avoiding cycles via path tracking
    const idQuery = `
      WITH RECURSIVE neighborhood(node_id, depth, path) AS (
        SELECT ?, 0, ',' || ? || ','
        UNION
        SELECT 
          CASE 
            WHEN e.source_id = n.node_id THEN e.target_id
            ELSE e.source_id
          END,
          n.depth + 1,
          n.path || CASE WHEN e.source_id = n.node_id THEN e.target_id ELSE e.source_id END || ','
        FROM neighborhood n
        JOIN edges e ON (e.source_id = n.node_id OR e.target_id = n.node_id)
        WHERE n.depth < ? ${edgeTypeFilter}
          AND instr(n.path, ',' || CASE WHEN e.source_id = n.node_id THEN e.target_id ELSE e.source_id END || ',') = 0
      )
      SELECT DISTINCT node_id FROM neighborhood
    `;

    const idRows = db.prepare(idQuery).all(...recursiveParams) as any[];
    const nodeIds = idRows.map((r) => r.node_id);

    if (nodeIds.length === 0) {
      return { nodes: [], edges: [] };
    }

    // Retrieve the nodes
    let nodeSql = 'SELECT * FROM nodes WHERE id IN (' + nodeIds.map(() => '?').join(',') + ')';
    const nodeQueryParams: any[] = [...nodeIds];

    if (params.node_types && params.node_types.length > 0) {
      nodeSql += ' AND type IN (' + params.node_types.map(() => '?').join(',') + ')';
      nodeQueryParams.push(...params.node_types);
    }

    const nodeRows = db.prepare(nodeSql).all(...nodeQueryParams) as NodeRow[];
    const nodes = nodeRows.map(parseNodeRow);

    // Filter nodeIds to those that were actually returned (matching node_types)
    const returnedNodeIds = nodes.map((n) => n.id);

    if (returnedNodeIds.length === 0) {
      return { nodes: [], edges: [] };
    }

    // Retrieve all edges connecting these nodes
    const placeholders = returnedNodeIds.map(() => '?').join(',');
    const edgeSql = `
      SELECT * FROM edges 
      WHERE project = ? 
        AND source_id IN (${placeholders}) 
        AND target_id IN (${placeholders})
    `;
    const edgeRows = db
      .prepare(edgeSql)
      .all(projectSlug, ...returnedNodeIds, ...returnedNodeIds) as EdgeRow[];

    const edges = edgeRows.map(parseEdgeRow);

    return { nodes, edges };
  }
}
