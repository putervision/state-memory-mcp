import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  AddEdgeSchema,
  RemoveEdgeSchema,
  BatchAddEdgesSchema,
  LinkVisualSchema,
} from '../schema/schemas.js';
import { EdgeEngine } from '../engine/edges.js';
import { batchAddEdges } from '../engine/batch.js';
import { SynergyEngine } from '../engine/synergy.js';
import { getDb, getProjectSlug } from '../engine/db.js';
import { parseArgs } from './helper.js';

export const edgeHandlers = {
  manage_edges: (args: unknown) => {
    const action = (args as any)?.action;
    if (!action) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Parameter "action" is required for manage_edges.'
      );
    }

    switch (action) {
      case 'add': {
        const data = parseArgs(AddEdgeSchema, args);
        return EdgeEngine.addEdge(data);
      }
      case 'remove': {
        const data = parseArgs(RemoveEdgeSchema, args);
        const result = EdgeEngine.removeEdge(data);
        if (!result) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Edge not found: relationship from ${data.source_id} to ${data.target_id} of type ${data.type}`
          );
        }
        return { removed: true };
      }
      case 'batch_add': {
        const data = parseArgs(BatchAddEdgesSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return batchAddEdges(db, {
          project: projectSlug,
          edges: data.edges,
        });
      }
      case 'link_visual': {
        const data = parseArgs(LinkVisualSchema, args);
        return SynergyEngine.linkVisualState(data);
      }
      default:
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid action "${action}" for manage_edges. Supported actions: add, remove, batch_add, link_visual.`
        );
    }
  },
};
