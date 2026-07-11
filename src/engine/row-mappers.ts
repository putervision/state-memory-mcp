import { BaseNode, Edge, NodeType, EdgeType, NodeRow, EdgeRow } from '../schema/types.js';
import { logger } from '../utils/logger.js';

/**
 * Idempotently and safely parse a NodeRow database record into a BaseNode domain object.
 * Empty string or falsy row.git_branch is coerced to undefined for domain model consistency.
 */
export function parseNodeRow(row: NodeRow): BaseNode {
  let metadata: Record<string, unknown> = {};
  if (row.metadata) {
    try {
      const parsed = JSON.parse(row.metadata);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        metadata = parsed;
      } else {
        logger.warn(`Expected object for node metadata on node ${row.id}, got: ${typeof parsed}`);
      }
    } catch (err: any) {
      logger.warn(`Failed to parse node metadata for node ${row.id}: ${err.message}`);
    }
  }

  let tags: string[] = [];
  if (row.tags) {
    try {
      const parsed = JSON.parse(row.tags);
      if (Array.isArray(parsed)) {
        tags = parsed;
      } else {
        logger.warn(`Expected array for node tags on node ${row.id}, got: ${typeof parsed}`);
      }
    } catch (err: any) {
      logger.warn(`Failed to parse node tags for node ${row.id}: ${err.message}`);
    }
  }

  return {
    id: row.id,
    type: row.type as NodeType,
    title: row.title,
    status: row.status,
    project: row.project,
    git_branch: row.git_branch || undefined,
    commit_hash: row.commit_hash || undefined,
    metadata,
    tags,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Idempotently and safely parse an EdgeRow database record into an Edge domain object.
 * Empty string or falsy row.git_branch is coerced to undefined for domain model consistency.
 */
export function parseEdgeRow(row: EdgeRow): Edge {
  let properties: Record<string, unknown> = {};
  if (row.properties) {
    try {
      const parsed = JSON.parse(row.properties);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        properties = parsed;
      } else {
        logger.warn(`Expected object for edge properties on edge ${row.id}, got: ${typeof parsed}`);
      }
    } catch (err: any) {
      logger.warn(`Failed to parse edge properties for edge ${row.id}: ${err.message}`);
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
