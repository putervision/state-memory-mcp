import Database from 'better-sqlite3';
import { getDb, getProjectSlug } from './db.js';
import { EventEngine } from './events.js';
import { BaseNode, Edge } from '../schema/types.js';
import { parseNodeRow, parseEdgeRow } from './row-mappers.js';

export interface StateAtTimestampResult {
  timestamp: string;
  nodes: BaseNode[];
  edges: Edge[];
  nodes_count: number;
  edges_count: number;
}

export function getStateAtTimestamp(params: {
  project?: string;
  timestamp: string;
}): StateAtTimestampResult {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  // Nodes created on or before target timestamp
  const nodeRows = db
    .prepare('SELECT * FROM nodes WHERE project = ? AND created_at <= ?')
    .all(projectSlug, params.timestamp) as any[];

  // Edges created on or before target timestamp
  const edgeRows = db
    .prepare('SELECT * FROM edges WHERE project = ? AND created_at <= ?')
    .all(projectSlug, params.timestamp) as any[];

  const nodes = nodeRows.map(parseNodeRow);
  const edges = edgeRows.map(parseEdgeRow);

  return {
    timestamp: params.timestamp,
    nodes,
    edges,
    nodes_count: nodes.length,
    edges_count: edges.length,
  };
}

export function revertToTimestamp(params: {
  project?: string;
  timestamp: string;
  session_id?: string;
}): { timestamp: string; removed_nodes_count: number; removed_edges_count: number } {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  return db.transaction(() => {
    // Delete nodes created after timestamp
    const futureNodes = db
      .prepare('SELECT id FROM nodes WHERE project = ? AND created_at > ?')
      .all(projectSlug, params.timestamp) as { id: string }[];

    const futureEdges = db
      .prepare('SELECT source_id, target_id, type FROM edges WHERE project = ? AND created_at > ?')
      .all(projectSlug, params.timestamp) as {
      source_id: string;
      target_id: string;
      type: string;
    }[];

    for (const edge of futureEdges) {
      db.prepare(
        'DELETE FROM edges WHERE project = ? AND source_id = ? AND target_id = ? AND type = ?'
      ).run(projectSlug, edge.source_id, edge.target_id, edge.type);
    }

    for (const node of futureNodes) {
      db.prepare('DELETE FROM nodes WHERE project = ? AND id = ?').run(projectSlug, node.id);
      db.prepare('DELETE FROM nodes_fts WHERE rowid IN (SELECT rowid FROM nodes WHERE id = ?)').run(
        node.id
      );
    }

    EventEngine.logEvent(db, {
      session_id: params.session_id,
      event_type: 'node_deleted',
      entity_type: 'node',
      entity_id: projectSlug,
      after_state: {
        timestamp: params.timestamp,
        removed_nodes: futureNodes.length,
        removed_edges: futureEdges.length,
      },
      project: projectSlug,
    });

    return {
      timestamp: params.timestamp,
      removed_nodes_count: futureNodes.length,
      removed_edges_count: futureEdges.length,
    };
  })();
}
