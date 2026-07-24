import Database from 'better-sqlite3';
import { parseNodeRow } from './row-mappers.js';
import { EventEngine } from './events.js';
import { GraphEngine } from './graph.js';
import { EdgeEngine } from './edges.js';
import { BatchCreateNodesParams, BatchAddEdgesParams, BaseNode, Edge } from '../schema/types.js';

export function batchUpdate(
  db: Database.Database,
  params: {
    project: string;
    ids: string[];
    status?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }
): { updated: number; failed: { id: string; reason: string }[] } {
  if (params.ids.length > 100) {
    throw new Error('Cannot update more than 100 nodes in a single batch call');
  }

  const failed: { id: string; reason: string }[] = [];
  let updated = 0;

  db.transaction(() => {
    for (const id of params.ids) {
      try {
        const nodeRow = db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as any;
        if (!nodeRow) {
          failed.push({ id, reason: 'Node not found' });
          continue;
        }

        const beforeNode = parseNodeRow(nodeRow);

        const newStatus = params.status !== undefined ? params.status : beforeNode.status;
        const newTags = params.tags !== undefined ? params.tags : beforeNode.tags;
        const newMetadata =
          params.metadata !== undefined
            ? { ...beforeNode.metadata, ...params.metadata }
            : beforeNode.metadata;

        const updatedAt = new Date().toISOString();

        db.prepare(
          `
          UPDATE nodes
          SET status = ?, tags = ?, metadata = ?, updated_at = ?
          WHERE id = ?
        `
        ).run(newStatus, JSON.stringify(newTags), JSON.stringify(newMetadata), updatedAt, id);

        const afterNode = {
          ...beforeNode,
          status: newStatus,
          tags: newTags,
          metadata: newMetadata,
          updated_at: updatedAt,
        };

        EventEngine.logEvent(db, {
          event_type: 'node_updated',
          entity_type: 'node',
          entity_id: id,
          before_state: beforeNode,
          after_state: afterNode,
          project: params.project,
        });

        updated++;
      } catch (err: any) {
        failed.push({ id, reason: err.message });
      }
    }
  })();

  return { updated, failed };
}

export function batchCreateNodes(
  db: Database.Database,
  params: BatchCreateNodesParams
): { created_nodes: BaseNode[] } {
  if (params.nodes.length > 100) {
    throw new Error('Cannot create more than 100 nodes in a single batch call');
  }

  const created_nodes: BaseNode[] = [];

  db.transaction(() => {
    for (const nodeInput of params.nodes) {
      const created = GraphEngine.addNode({
        project: params.project,
        type: nodeInput.type,
        title: nodeInput.title,
        status: nodeInput.status,
        metadata: nodeInput.metadata,
        tags: nodeInput.tags,
      });
      created_nodes.push(created);
    }
  })();

  return { created_nodes };
}

export function batchAddEdges(
  db: Database.Database,
  params: BatchAddEdgesParams
): { created_edges: Edge[] } {
  if (params.edges.length > 100) {
    throw new Error('Cannot add more than 100 edges in a single batch call');
  }

  const created_edges: Edge[] = [];

  db.transaction(() => {
    for (const edgeInput of params.edges) {
      const created = EdgeEngine.addEdge({
        project: params.project,
        source_id: edgeInput.source_id,
        target_id: edgeInput.target_id,
        type: edgeInput.type,
        properties: edgeInput.properties,
      });
      created_edges.push(created);
    }
  })();

  return { created_edges };
}
