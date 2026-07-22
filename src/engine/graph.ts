import { getDb, getProjectSlug } from './db.js';
import { BaseNode, Edge, NodeType, NodeRow, EdgeRow } from '../schema/types.js';
import { parseNodeRow, parseEdgeRow } from './row-mappers.js';
import { DEFAULT_STATUS_BY_TYPE } from '../schema/schemas.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { getCurrentBranch } from '../utils/git.js';
import { logger } from '../utils/logger.js';
import { EventEngine } from './events.js';

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
    session_id?: string | null;
  }): BaseNode {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    return db.transaction(() => {
      const id = generateId();
      const now = getCurrentIsoString();
      const branch = getCurrentBranch() || undefined;
      const status = params.status || DEFAULT_STATUS_BY_TYPE[params.type];

      const metadataStr = JSON.stringify(params.metadata || {});
      const tagsStr = JSON.stringify(params.tags || []);

      const stmt = db.prepare(`
        INSERT INTO nodes (id, type, title, status, project, git_branch, metadata, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
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

      try {
        db.prepare(
          `
          INSERT INTO nodes_fts(rowid, title, metadata, tags)
          VALUES (?, ?, ?, ?)
        `
        ).run(result.lastInsertRowid, params.title, metadataStr, tagsStr);
      } catch (err: any) {
        logger.warn(`Failed to update full-text search index for node ${id}: ${err.message}`);
      }

      logger.debug(`Added node ${id} (${params.type}) to project ${projectSlug}`);

      const node: BaseNode = {
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

      EventEngine.logEvent(db, {
        session_id: params.session_id,
        event_type: 'node_created',
        entity_type: 'node',
        entity_id: id,
        after_state: node,
        project: projectSlug,
      });

      return node;
    })();
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

    const nodeRow = db
      .prepare(
        `
      SELECT * FROM nodes WHERE id = ?
    `
      )
      .get(params.id) as NodeRow | undefined;

    if (!nodeRow) {
      return null;
    }

    const node = parseNodeRow(nodeRow);
    const result: GetNodeResult = { node };

    if (params.include_edges !== false) {
      // Fetch inbound edges
      const inboundRows = db
        .prepare(
          `
        SELECT * FROM edges WHERE target_id = ?
      `
        )
        .all(params.id) as EdgeRow[];

      result.inbound_edges = inboundRows.map(parseEdgeRow);

      // Fetch outbound edges
      const outboundRows = db
        .prepare(
          `
        SELECT * FROM edges WHERE source_id = ?
      `
        )
        .all(params.id) as EdgeRow[];

      result.outbound_edges = outboundRows.map(parseEdgeRow);
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
    session_id?: string | null;
  }): BaseNode | null {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    return db.transaction(() => {
      const existingResult = GraphEngine.getNode({
        project: projectSlug,
        id: params.id,
        include_edges: false,
      });
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

      const row = db.prepare('SELECT rowid FROM nodes WHERE id = ?').get(params.id) as
        { rowid: number } | undefined;

      const stmt = db.prepare(`
        UPDATE nodes
        SET title = ?, status = ?, metadata = ?, tags = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(title, status, metadataStr, tagsStr, now, params.id);

      if (row) {
        try {
          db.prepare(
            `
            INSERT INTO nodes_fts(nodes_fts, rowid, title, metadata, tags)
            VALUES ('delete', ?, ?, ?, ?)
          `
          ).run(row.rowid, node.title, JSON.stringify(node.metadata), JSON.stringify(node.tags));

          db.prepare(
            `
            INSERT INTO nodes_fts(rowid, title, metadata, tags)
            VALUES (?, ?, ?, ?)
          `
          ).run(row.rowid, title, metadataStr, tagsStr);
        } catch (err: any) {
          logger.warn(
            `Failed to update full-text search index for updated node ${params.id}: ${err.message}`
          );
        }
      }

      const updatedNode: BaseNode = {
        ...node,
        title,
        status,
        metadata: finalMetadata,
        tags,
        updated_at: now,
      };

      EventEngine.logEvent(db, {
        session_id: params.session_id,
        event_type: 'node_updated',
        entity_type: 'node',
        entity_id: params.id,
        before_state: node,
        after_state: updatedNode,
        project: projectSlug,
      });

      return updatedNode;
    })();
  }

  /**
   * Delete a node and its connected edges
   */
  static removeNode(params: {
    project?: string;
    id: string;
    session_id?: string | null;
  }): { deleted_node_id: string; deleted_edge_count: number } | null {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    return db.transaction(() => {
      const existingResult = GraphEngine.getNode({
        project: projectSlug,
        id: params.id,
        include_edges: false,
      });
      if (!existingResult) {
        return null;
      }
      const { node } = existingResult;

      const edgeCountRow = db
        .prepare(
          `
        SELECT COUNT(*) as count FROM edges WHERE source_id = ? OR target_id = ?
      `
        )
        .get(params.id, params.id) as any;

      const deletedEdgeCount = edgeCountRow ? edgeCountRow.count : 0;

      const row = db.prepare('SELECT rowid FROM nodes WHERE id = ?').get(params.id) as
        { rowid: number } | undefined;

      const stmt = db.prepare(`
        DELETE FROM nodes WHERE id = ?
      `);
      const result = stmt.run(params.id);

      if (result.changes === 0) {
        return null;
      }

      if (row) {
        try {
          db.prepare(
            `
            INSERT INTO nodes_fts(nodes_fts, rowid, title, metadata, tags)
            VALUES ('delete', ?, ?, ?, ?)
          `
          ).run(row.rowid, node.title, JSON.stringify(node.metadata), JSON.stringify(node.tags));
        } catch (err: any) {
          logger.warn(
            `Failed to remove full-text search index for deleted node ${params.id}: ${err.message}`
          );
        }
      }

      logger.debug(
        `Deleted node ${params.id} and ${deletedEdgeCount} edges in project ${projectSlug}`
      );

      EventEngine.logEvent(db, {
        session_id: params.session_id,
        event_type: 'node_deleted',
        entity_type: 'node',
        entity_id: params.id,
        before_state: node,
        project: projectSlug,
      });

      return {
        deleted_node_id: params.id,
        deleted_edge_count: deletedEdgeCount,
      };
    })();
  }
}
