import { getDb, getProjectSlug } from './db.js';
import { BaseNode, Edge, NodeType, NodeStatus, NodeRow, EdgeRow } from '../schema/types.js';
import { DEFAULT_STATUS_BY_TYPE, MetadataSchema, PropertiesSchema } from '../schema/zod.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { getCurrentBranch } from '../utils/git.js';
import { logger } from '../utils/logger.js';

export interface GetNodeResult {
  node: BaseNode;
  inbound_edges?: Edge[];
  outbound_edges?: Edge[];
}

export class GraphEngine {
  /**
   * Add a node to the project graph
   */
  static addNode(params: {
    project?: string;
    type: NodeType;
    title: string;
    status?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): BaseNode {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);
    
    const id = generateId();
    const now = getCurrentIsoString();
    const branch = getCurrentBranch();
    const status = params.status || DEFAULT_STATUS_BY_TYPE[params.type];
    
    const metadataStr = JSON.stringify(params.metadata || {});
    const tagsStr = JSON.stringify(params.tags || []);

    const stmt = db.prepare(`
      INSERT INTO nodes (id, type, title, status, project, git_branch, metadata, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      params.type,
      params.title,
      status,
      projectSlug,
      branch,
      metadataStr,
      tagsStr,
      now,
      now
    );

    logger.debug(`Added node ${id} (${params.type}) to project ${projectSlug}`);

    return {
      id,
      type: params.type,
      title: params.title,
      status,
      project: projectSlug,
      git_branch: branch,
      metadata: params.metadata || {},
      tags: params.tags || [],
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Retrieve a single node by ID and optionally its connected edges
   */
  static getNode(params: {
    project?: string;
    id: string;
    include_edges?: boolean;
  }): GetNodeResult | null {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    const nodeRow = db.prepare(`
      SELECT * FROM nodes WHERE id = ?
    `).get(params.id) as NodeRow | undefined;

    if (!nodeRow) {
      return null;
    }

    const node: BaseNode = {
      id: nodeRow.id,
      type: nodeRow.type as NodeType,
      title: nodeRow.title,
      status: nodeRow.status as NodeStatus,
      project: nodeRow.project,
      git_branch: nodeRow.git_branch,
      metadata: MetadataSchema.parse(JSON.parse(nodeRow.metadata || '{}')),
      tags: JSON.parse(nodeRow.tags || '[]'),
      created_at: nodeRow.created_at,
      updated_at: nodeRow.updated_at,
    };

    const result: GetNodeResult = { node };

    if (params.include_edges !== false) {
      // Fetch inbound edges
      const inboundRows = db.prepare(`
        SELECT * FROM edges WHERE target_id = ?
      `).all(params.id) as EdgeRow[];

      result.inbound_edges = inboundRows.map((row) => ({
        id: row.id,
        source_id: row.source_id,
        target_id: row.target_id,
        type: row.type as any,
        properties: PropertiesSchema.parse(JSON.parse(row.properties || '{}')),
        project: row.project,
        git_branch: row.git_branch,
        created_at: row.created_at,
      }));

      // Fetch outbound edges
      const outboundRows = db.prepare(`
        SELECT * FROM edges WHERE source_id = ?
      `).all(params.id) as EdgeRow[];

      result.outbound_edges = outboundRows.map((row) => ({
        id: row.id,
        source_id: row.source_id,
        target_id: row.target_id,
        type: row.type as any,
        properties: PropertiesSchema.parse(JSON.parse(row.properties || '{}')),
        project: row.project,
        git_branch: row.git_branch,
        created_at: row.created_at,
      }));
    }

    return result;
  }

  /**
   * Update properties of an existing node
   */
  static updateNode(params: {
    project?: string;
    id: string;
    title?: string;
    status?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): BaseNode | null {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    const existingResult = GraphEngine.getNode({ project: projectSlug, id: params.id, include_edges: false });
    if (!existingResult) {
      return null;
    }

    const { node } = existingResult;
    const now = getCurrentIsoString();
    
    const finalMetadata = params.metadata
      ? { ...node.metadata, ...params.metadata }
      : node.metadata;

    const title = params.title !== undefined ? params.title : node.title;
    const status = params.status !== undefined ? params.status : node.status;
    const tags = params.tags !== undefined ? params.tags : node.tags;

    const metadataStr = JSON.stringify(finalMetadata);
    const tagsStr = JSON.stringify(tags);

    const stmt = db.prepare(`
      UPDATE nodes
      SET title = ?, status = ?, metadata = ?, tags = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(title, status, metadataStr, tagsStr, now, params.id);

    return {
      ...node,
      title,
      status,
      metadata: finalMetadata,
      tags,
      updated_at: now,
    };
  }

  /**
   * Delete a node and its connected edges
   */
  static removeNode(params: {
    project?: string;
    id: string;
  }): { deleted_node_id: string; deleted_edge_count: number } | null {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    const edgeCountRow = db.prepare(`
      SELECT COUNT(*) as count FROM edges WHERE source_id = ? OR target_id = ?
    `).get(params.id, params.id) as any;

    const deletedEdgeCount = edgeCountRow ? edgeCountRow.count : 0;

    const stmt = db.prepare(`
      DELETE FROM nodes WHERE id = ?
    `);

    const result = stmt.run(params.id);

    if (result.changes === 0) {
      return null;
    }

    logger.debug(`Deleted node ${params.id} and ${deletedEdgeCount} edges in project ${projectSlug}`);

    return {
      deleted_node_id: params.id,
      deleted_edge_count: deletedEdgeCount,
    };
  }
}
