import type { Database } from 'better-sqlite3';
import { getDb, getProjectSlug } from './db.js';
import { Edge, EdgeType, EdgeRow } from '../schema/types.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { getCurrentBranch } from '../utils/git.js';
import { logger } from '../utils/logger.js';
import { EventEngine } from './events.js';
import { parseEdgeRow } from './row-mappers.js';

/**
 * Cycle detection for dependency-like edges (depends_on, blocks, child_of).
 * Performs a recursive CTE query to see if a dependency path would be violated.
 *
 * @param db - Database instance.
 * @param sourceId - Source node ID.
 * @param targetId - Target node ID.
 * @param edgeType - Edge type/relationship type.
 * @returns True if adding this edge would introduce a circular dependency, false otherwise.
 */
export function hasCycle(
  db: Database, // Database instance
  sourceId: string,
  targetId: string,
  edgeType: string
): boolean {
  if (edgeType !== 'depends_on' && edgeType !== 'blocks' && edgeType !== 'child_of') {
    return false;
  }

  // If edgeType is 'depends_on' or 'child_of', we are adding sourceId -> targetId dependency.
  // This creates a cycle if there is already a dependency path targetId -> sourceId.
  // If edgeType is 'blocks', sourceId blocks targetId (targetId depends on sourceId).
  // So we are adding targetId -> sourceId dependency.
  // This creates a cycle if there is already a dependency path sourceId -> targetId.
  const startId = edgeType === 'blocks' ? sourceId : targetId;
  const endId = edgeType === 'blocks' ? targetId : sourceId;

  const stmt = db.prepare(`
    WITH RECURSIVE path(node_id, depth) AS (
      SELECT ?, 0
      UNION
      SELECT 
        CASE 
          WHEN e.type = 'depends_on' AND e.source_id = p.node_id THEN e.target_id
          WHEN e.type = 'child_of' AND e.source_id = p.node_id THEN e.target_id
          WHEN e.type = 'blocks' AND e.target_id = p.node_id THEN e.source_id
        END as next_node_id,
        p.depth + 1
      FROM path p
      JOIN edges e ON (
        (e.type = 'depends_on' AND e.source_id = p.node_id) OR
        (e.type = 'child_of' AND e.source_id = p.node_id) OR
        (e.type = 'blocks' AND e.target_id = p.node_id)
      )
      WHERE p.depth < 1000
    )
    SELECT 1 FROM path WHERE node_id = ? LIMIT 1
  `);

  const result = stmt.get(startId, endId);
  return !!result;
}

/**
 * Engine for managing graph edges/relationships between nodes, including cycle detection.
 */
export class EdgeEngine {
  /**
   * Add a directed relationship between two nodes.
   *
   * @param params - Edge creation parameters.
   * @param params.project - Optional project identifier.
   * @param params.source_id - Source node ID.
   * @param params.target_id - Target node ID.
   * @param params.type - The relationship type.
   * @param params.properties - Optional edge properties.
   * @returns The created Edge object.
   * @throws {Error} If source/target node not found, if duplicate edge exists, or if a cycle is introduced.
   */
  static addEdge(params: {
    project?: string;
    source_id: string;
    target_id: string;
    type: EdgeType;
    properties?: Record<string, unknown>;
    session_id?: string | null;
  }): Edge {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    return db.transaction(() => {
      // Verify source and target exist
      const sourceExists = db.prepare('SELECT 1 FROM nodes WHERE id = ?').get(params.source_id);
      if (!sourceExists) {
        throw new Error(`Source node not found: ${params.source_id}`);
      }

      const targetExists = db.prepare('SELECT 1 FROM nodes WHERE id = ?').get(params.target_id);
      if (!targetExists) {
        throw new Error(`Target node not found: ${params.target_id}`);
      }

      // Cycle detection for dependency-like edge types
      if (hasCycle(db, params.source_id, params.target_id, params.type)) {
        throw new Error(`Cannot add edge: relationship introduces a circular dependency`);
      }

      const id = generateId();
      const now = getCurrentIsoString();
      const branch = getCurrentBranch() || undefined;
      const propertiesStr = JSON.stringify(params.properties || {});

      const stmt = db.prepare(`
        INSERT OR IGNORE INTO edges (id, source_id, target_id, type, properties, project, git_branch, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        id,
        params.source_id,
        params.target_id,
        params.type,
        propertiesStr,
        projectSlug,
        branch,
        now
      );

      if (result.changes === 0) {
        throw new Error(
          `Relationship already exists: ${params.source_id} --${params.type}--> ${params.target_id}`
        );
      }

      logger.debug(
        `Added edge ${id} (${params.type}) from ${params.source_id} to ${params.target_id}`
      );

      const edge: Edge = {
        id,
        source_id: params.source_id,
        target_id: params.target_id,
        type: params.type,
        properties: params.properties || {},
        project: projectSlug,
        git_branch: branch,
        created_at: now,
      };

      EventEngine.logEvent(db, {
        session_id: params.session_id,
        event_type: 'edge_created',
        entity_type: 'edge',
        entity_id: id,
        after_state: edge,
        project: projectSlug,
      });

      return edge;
    })();
  }

  /**
   * Remove a relationship.
   *
   * @param params - Edge deletion parameters.
   * @param params.project - Optional project identifier.
   * @param params.source_id - Source node ID.
   * @param params.target_id - Target node ID.
   * @param params.type - The relationship type to delete.
   * @returns True if the edge was found and deleted, false otherwise.
   */
  static removeEdge(params: {
    project?: string;
    source_id: string;
    target_id: string;
    type: EdgeType;
    session_id?: string | null;
  }): boolean {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    return db.transaction(() => {
      // Fetch edge before deleting to capture its state
      const existingRow = db
        .prepare(
          `
        SELECT * FROM edges WHERE source_id = ? AND target_id = ? AND type = ?
      `
        )
        .get(params.source_id, params.target_id, params.type) as EdgeRow | undefined;

      if (!existingRow) {
        return false;
      }
      const edge = parseEdgeRow(existingRow);

      const stmt = db.prepare(`
        DELETE FROM edges
        WHERE source_id = ? AND target_id = ? AND type = ?
      `);

      const result = stmt.run(params.source_id, params.target_id, params.type);

      if (result.changes > 0) {
        logger.debug(
          `Removed edge (${params.type}) from ${params.source_id} to ${params.target_id}`
        );
        EventEngine.logEvent(db, {
          session_id: params.session_id,
          event_type: 'edge_deleted',
          entity_type: 'edge',
          entity_id: edge.id,
          before_state: edge,
          project: projectSlug,
        });
        return true;
      }
      return false;
    })();
  }
}
