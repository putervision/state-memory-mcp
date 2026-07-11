import Database from 'better-sqlite3';
import { getProjectSlug } from './db.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { parseNodeRow, parseEdgeRow } from './row-mappers.js';
import { NodeRow, EdgeRow, BaseNode, Edge } from '../schema/types.js';
import { DatabaseError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

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
  property_changes: {
    node_id: string;
    type: string;
    title: string;
    property: string;
    before: any;
    after: any;
  }[];
  edges_added: { source_id: string; target_id: string; type: string }[];
  edges_removed: { source_id: string; target_id: string; type: string }[];
}

export class SnapshotEngine {
  /**
   * Save a snapshot of the current project graph state.
   * Note: Snapshots capture all nodes and edges across all branches (no branch filtering).
   */
  static saveSnapshot(
    db: Database.Database,
    params: {
      project: string;
      session_id?: string | null;
      force?: boolean;
    }
  ): { snapshot_id: string; node_count: number; edge_count: number } {
    const projectSlug = getProjectSlug(params.project);
    const id = generateId();
    const now = getCurrentIsoString();

    const nodes = db.prepare('SELECT * FROM nodes WHERE project = ?').all(projectSlug) as NodeRow[];
    const edges = db.prepare('SELECT * FROM edges WHERE project = ?').all(projectSlug) as EdgeRow[];

    const parsedNodes = nodes.map(parseNodeRow);
    const parsedEdges = edges.map(parseEdgeRow);

    const MAX_SNAPSHOT_WARN = 5000;
    const MAX_SNAPSHOT_HARD = 10000;

    if (parsedNodes.length > MAX_SNAPSHOT_HARD && !params.force) {
      throw new DatabaseError(
        `Snapshot aborted: graph contains ${parsedNodes.length} nodes (max: ${MAX_SNAPSHOT_HARD}). ` +
          'Pass force: true to override.'
      );
    }
    if (parsedNodes.length > MAX_SNAPSHOT_WARN) {
      logger.warn(`Large snapshot: ${parsedNodes.length} nodes. Consider exporting in batches.`);
    }

    const snapshotObj = {
      nodes: parsedNodes,
      edges: parsedEdges,
    };

    const snapshotStr = JSON.stringify(snapshotObj);

    db.prepare(
      `
      INSERT INTO snapshots (id, project, session_id, snapshot, node_count, edge_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      projectSlug,
      params.session_id || null,
      snapshotStr,
      parsedNodes.length,
      parsedEdges.length,
      now
    );

    return {
      snapshot_id: id,
      node_count: parsedNodes.length,
      edge_count: parsedEdges.length,
    };
  }

  /**
   * Lists available snapshots for a project.
   * Note: Snapshots capture all branches.
   */
  static listSnapshots(
    db: Database.Database,
    params: {
      project: string;
      limit?: number;
    }
  ): any[] {
    const limit = params.limit || 50;
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
   * Computes the semantic diff between two snapshots.
   * Note: Snapshots capture all branches (no branch filtering).
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
    // Deep property changes (all properties compared)
    const property_changes: SnapshotDiff['property_changes'] = [];

    for (const [id, nodeB] of nodesB.entries()) {
      const nodeA = nodesA.get(id);
      if (!nodeA) {
        nodes_added.push({ id, type: nodeB.type, title: nodeB.title });
      } else {
        if (nodeA.status !== nodeB.status) {
          status_changes.push({
            node_id: id,
            type: nodeB.type,
            title: nodeB.title,
            before_status: nodeA.status,
            after_status: nodeB.status,
          });
        }
        if (nodeA.title !== nodeB.title) {
          property_changes.push({
            node_id: id,
            type: nodeB.type,
            title: nodeB.title,
            property: 'title',
            before: nodeA.title,
            after: nodeB.title,
          });
        }
        if (nodeA.git_branch !== nodeB.git_branch) {
          property_changes.push({
            node_id: id,
            type: nodeB.type,
            title: nodeB.title,
            property: 'git_branch',
            before: nodeA.git_branch,
            after: nodeB.git_branch,
          });
        }
        if (JSON.stringify(nodeA.metadata) !== JSON.stringify(nodeB.metadata)) {
          property_changes.push({
            node_id: id,
            type: nodeB.type,
            title: nodeB.title,
            property: 'metadata',
            before: nodeA.metadata,
            after: nodeB.metadata,
          });
        }
        const tagsAStr = JSON.stringify([...(nodeA.tags || [])].sort());
        const tagsBStr = JSON.stringify([...(nodeB.tags || [])].sort());
        if (tagsAStr !== tagsBStr) {
          property_changes.push({
            node_id: id,
            type: nodeB.type,
            title: nodeB.title,
            property: 'tags',
            before: nodeA.tags,
            after: nodeB.tags,
          });
        }
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
      property_changes,
      edges_added,
      edges_removed,
    };
  }
}
