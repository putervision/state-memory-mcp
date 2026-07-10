import Database from 'better-sqlite3';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { parseNodeRow, parseEdgeRow } from './row-mappers.js';
import { NodeRow, EdgeRow, BaseNode, Edge } from '../schema/types.js';
import { DatabaseError } from '../utils/errors.js';

export interface SnapshotRecord {
  id: string;
  project: string;
  session_id: string | null;
  snapshot: string; // JSON string of { nodes: BaseNode[], edges: Edge[] }
  node_count: number;
  edge_count: number;
  created_at: string;
}

export interface SnapshotDiff {
  nodes_added: { id: string; type: string; title: string }[];
  nodes_removed: { id: string; type: string; title: string }[];
  status_changes: {
    node_id: string;
    type: string;
    title: string;
    before_status: string;
    after_status: string;
  }[];
  edges_added: { source_id: string; target_id: string; type: string }[];
  edges_removed: { source_id: string; target_id: string; type: string }[];
}

export class SnapshotEngine {
  /**
   * Save a snapshot of the current project graph state
   */
  static saveSnapshot(
    db: Database.Database,
    params: {
      project: string;
      session_id?: string | null;
    }
  ): { snapshot_id: string; node_count: number; edge_count: number } {
    const id = generateId();
    const created_at = getCurrentIsoString();
    const session_id = params.session_id || null;

    // Fetch all nodes in the project
    const nodeRows = db
      .prepare('SELECT * FROM nodes WHERE project = ?')
      .all(params.project) as NodeRow[];
    const nodes = nodeRows.map(parseNodeRow);

    // Fetch all edges in the project
    const edgeRows = db
      .prepare('SELECT * FROM edges WHERE project = ?')
      .all(params.project) as EdgeRow[];
    const edges = edgeRows.map(parseEdgeRow);

    const snapshotData = { nodes, edges };
    const snapshotStr = JSON.stringify(snapshotData);

    db.prepare(
      `
      INSERT INTO snapshots (id, project, session_id, snapshot, node_count, edge_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(id, params.project, session_id, snapshotStr, nodes.length, edges.length, created_at);

    return {
      snapshot_id: id,
      node_count: nodes.length,
      edge_count: edges.length,
    };
  }

  /**
   * List saved snapshots for a project
   */
  static listSnapshots(
    db: Database.Database,
    params: {
      project: string;
      limit?: number;
    }
  ): {
    id: string;
    session_id: string | null;
    node_count: number;
    edge_count: number;
    created_at: string;
  }[] {
    const limit = params.limit !== undefined ? params.limit : 20;
    return db
      .prepare(
        `
        SELECT id, session_id, node_count, edge_count, created_at 
        FROM snapshots 
        WHERE project = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `
      )
      .all(params.project, limit) as any[];
  }

  /**
   * Computes the semantic diff between two snapshots
   */
  static diffSnapshots(
    db: Database.Database,
    params: {
      project: string;
      snapshot_id_a: string;
      snapshot_id_b: string;
    }
  ): SnapshotDiff {
    const rowA = db
      .prepare('SELECT snapshot FROM snapshots WHERE id = ? AND project = ?')
      .get(params.snapshot_id_a, params.project) as { snapshot: string } | undefined;
    const rowB = db
      .prepare('SELECT snapshot FROM snapshots WHERE id = ? AND project = ?')
      .get(params.snapshot_id_b, params.project) as { snapshot: string } | undefined;

    if (!rowA) {
      throw new DatabaseError(`Snapshot not found: ${params.snapshot_id_a}`);
    }
    if (!rowB) {
      throw new DatabaseError(`Snapshot not found: ${params.snapshot_id_b}`);
    }

    const dataA = JSON.parse(rowA.snapshot) as { nodes: BaseNode[]; edges: Edge[] };
    const dataB = JSON.parse(rowB.snapshot) as { nodes: BaseNode[]; edges: Edge[] };

    const nodesA = new Map<string, BaseNode>();
    for (const node of dataA.nodes) {
      nodesA.set(node.id, node);
    }

    const nodesB = new Map<string, BaseNode>();
    for (const node of dataB.nodes) {
      nodesB.set(node.id, node);
    }

    // Nodes added in B
    const nodes_added: SnapshotDiff['nodes_added'] = [];
    // Status changes
    const status_changes: SnapshotDiff['status_changes'] = [];

    for (const [id, nodeB] of nodesB.entries()) {
      const nodeA = nodesA.get(id);
      if (!nodeA) {
        nodes_added.push({ id, type: nodeB.type, title: nodeB.title });
      } else if (nodeA.status !== nodeB.status) {
        status_changes.push({
          node_id: id,
          type: nodeB.type,
          title: nodeB.title,
          before_status: nodeA.status,
          after_status: nodeB.status,
        });
      }
    }

    // Nodes removed in B
    const nodes_removed: SnapshotDiff['nodes_removed'] = [];
    for (const [id, nodeA] of nodesA.entries()) {
      if (!nodesB.has(id)) {
        nodes_removed.push({ id, type: nodeA.type, title: nodeA.title });
      }
    }

    // Edges comparison helper key
    const edgeKey = (e: { source_id: string; target_id: string; type: string }) =>
      `${e.source_id}:${e.target_id}:${e.type}`;

    const edgesA = new Set<string>();
    for (const edge of dataA.edges) {
      edgesA.add(edgeKey(edge));
    }

    const edgesB = new Set<string>();
    for (const edge of dataB.edges) {
      edgesB.add(edgeKey(edge));
    }

    // Edges added in B
    const edges_added: SnapshotDiff['edges_added'] = [];
    for (const edge of dataB.edges) {
      if (!edgesA.has(edgeKey(edge))) {
        edges_added.push({ source_id: edge.source_id, target_id: edge.target_id, type: edge.type });
      }
    }

    // Edges removed in B
    const edges_removed: SnapshotDiff['edges_removed'] = [];
    for (const edge of dataA.edges) {
      if (!edgesB.has(edgeKey(edge))) {
        edges_removed.push({
          source_id: edge.source_id,
          target_id: edge.target_id,
          type: edge.type,
        });
      }
    }

    return {
      nodes_added,
      nodes_removed,
      status_changes,
      edges_added,
      edges_removed,
    };
  }
}
