import { BaseNode, Edge, NodeType, EdgeType, NodeRow, EdgeRow } from '../schema/types.js';
import { logger } from '../utils/logger.js';

/**
 * Idempotently and safely parse a NodeRow database record into a BaseNode domain object.
 */
export function parseNodeRow(row: NodeRow): BaseNode {
  let metadata: Record<string, unknown> = {};
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata);
    } catch (err: any) {
      logger.debug(`Failed to parse node metadata for node ${row.id}: ${err.message}`);
    }
  }

  let tags: string[] = [];
  if (row.tags) {
    try {
      tags = JSON.parse(row.tags);
    } catch (err: any) {
      logger.debug(`Failed to parse node tags for node ${row.id}: ${err.message}`);
    }
  }

  return {
    id: row.id,
    type: row.type as NodeType,
    title: row.title,
    status: row.status,
    project: row.project,
    git_branch: row.git_branch || undefined,
    metadata,
    tags,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Idempotently and safely parse an EdgeRow database record into an Edge domain object.
 */
export function parseEdgeRow(row: EdgeRow): Edge {
  let properties: Record<string, unknown> = {};
  if (row.properties) {
    try {
      properties = JSON.parse(row.properties);
    } catch (err: any) {
      logger.debug(`Failed to parse edge properties for edge ${row.id}: ${err.message}`);
    }
  }

  return {
    id: row.id,
    source_id: row.source_id,
    target_id: row.target_id,
    type: row.type as EdgeType,
    properties,
    project: row.project,
    git_branch: row.git_branch || undefined,
    created_at: row.created_at,
  };
}
