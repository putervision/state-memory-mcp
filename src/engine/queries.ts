import { getDb, getProjectSlug } from './db.js';
import { BaseNode, Edge, NodeType } from '../schema/types.js';
import { getCurrentBranch } from '../utils/git.js';
import { logger } from '../utils/logger.js';

export class QueryEngine {
  /**
   * List nodes with advanced filtering and pagination.
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

    // First get the total count for pagination info
    const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
    const countRow = db.prepare(countSql).get(...queryParams) as any;
    const total_count = countRow ? countRow.total : 0;

    // Apply pagination
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const limit = params.limit !== undefined ? params.limit : 50;
    const offset = params.offset !== undefined ? params.offset : 0;
    queryParams.push(limit, offset);

    const rows = db.prepare(sql).all(...queryParams) as any[];

    const nodes = rows.map((row) => ({
      id: row.id,
      type: row.type as NodeType,
      title: row.title,
      status: row.status,
      project: row.project,
      git_branch: row.git_branch,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      tags: row.tags ? JSON.parse(row.tags) : [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return { nodes, total_count };
  }

  /**
   * Search nodes using FTS5 virtual table.
   */
  static searchNodes(params: {
    project?: string;
    query: string;
    type?: NodeType;
    status?: string;
    limit?: number;
    git_branch?: string;
  }): { nodes: BaseNode[]; total_count: number } {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    // SQLite FTS5 query matching n.rowid to f.rowid
    let sql = `
      SELECT n.* 
      FROM nodes n
      JOIN nodes_fts f ON n.rowid = f.rowid
      WHERE n.project = ? AND nodes_fts MATCH ?
    `;
    const queryParams: any[] = [projectSlug, params.query];

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

    const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
    const countRow = db.prepare(countSql).get(...queryParams) as any;
    const total_count = countRow ? countRow.total : 0;

    sql += ' LIMIT ?';
    const limit = params.limit !== undefined ? params.limit : 20;
    queryParams.push(limit);

    const rows = db.prepare(sql).all(...queryParams) as any[];

    const nodes = rows.map((row) => ({
      id: row.id,
      type: row.type as NodeType,
      title: row.title,
      status: row.status,
      project: row.project,
      git_branch: row.git_branch,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      tags: row.tags ? JSON.parse(row.tags) : [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return { nodes, total_count };
  }

  /**
   * Get recursive N-hop neighborhood of a root node.
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
    const recursiveParams: any[] = [params.root_id, depth];

    if (params.edge_types && params.edge_types.length > 0) {
      const placeholders = params.edge_types.map(() => '?').join(',');
      edgeTypeFilter = `AND e.type IN (${placeholders})`;
      recursiveParams.push(...params.edge_types);
    }

    // Recursive CTE to gather node IDs in N hops
    const idQuery = `
      WITH RECURSIVE neighborhood(node_id, depth) AS (
        SELECT ?, 0
        UNION
        SELECT 
          CASE 
            WHEN e.source_id = n.node_id THEN e.target_id
            ELSE e.source_id
          END,
          n.depth + 1
        FROM neighborhood n
        JOIN edges e ON (e.source_id = n.node_id OR e.target_id = n.node_id)
        WHERE n.depth < ? ${edgeTypeFilter}
      )
      SELECT DISTINCT node_id FROM neighborhood
    `;

    const idRows = db.prepare(idQuery).all(...recursiveParams) as any[];
    const nodeIds = idRows.map(r => r.node_id);

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

    const nodeRows = db.prepare(nodeSql).all(...nodeQueryParams) as any[];
    const nodes = nodeRows.map((row) => ({
      id: row.id,
      type: row.type as NodeType,
      title: row.title,
      status: row.status,
      project: row.project,
      git_branch: row.git_branch,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      tags: row.tags ? JSON.parse(row.tags) : [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    // Filter nodeIds to those that were actually returned (matching node_types)
    const returnedNodeIds = nodes.map(n => n.id);

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
    const edgeRows = db.prepare(edgeSql).all(projectSlug, ...returnedNodeIds, ...returnedNodeIds) as any[];

    const edges = edgeRows.map((row) => ({
      id: row.id,
      source_id: row.source_id,
      target_id: row.target_id,
      type: row.type as any,
      properties: row.properties ? JSON.parse(row.properties) : {},
      project: row.project,
      git_branch: row.git_branch,
      created_at: row.created_at,
    }));

    return { nodes, edges };
  }
}
