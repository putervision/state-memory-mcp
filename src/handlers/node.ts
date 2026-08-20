import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  AddNodeSchema,
  UpdateNodeSchema,
  GetNodeSchema,
  RemoveNodeSchema,
  ListNodesSchema,
  SearchNodesSchema,
  BatchCreateNodesSchema,
  BatchUpdateSchema,
  AddNoteSchema,
} from '../schema/schemas.js';
import { GraphEngine } from '../engine/graph.js';
import { QueryEngine } from '../engine/queries.js';
import { EdgeEngine } from '../engine/edges.js';
import { batchCreateNodes, batchUpdate } from '../engine/batch.js';
import { getDb, getProjectSlug } from '../engine/db.js';
import { parseArgs, suggestLinks, findFuzzyNodeSuggestions } from './helper.js';

export const nodeHandlers = {
  manage_nodes: (args: unknown) => {
    const action = (args as any)?.action;
    if (!action) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Parameter "action" is required for manage_nodes.'
      );
    }

    switch (action) {
      case 'create': {
        const data = parseArgs(AddNodeSchema, args);
        const node = GraphEngine.addNode(data);
        suggestLinks(node.project, node);
        return node;
      }
      case 'update': {
        const data = parseArgs(UpdateNodeSchema, args);
        const node = GraphEngine.updateNode(data);
        if (!node) {
          const projectSlug = getProjectSlug(data.project);
          const msg = findFuzzyNodeSuggestions(projectSlug, data.id);
          throw new McpError(ErrorCode.InvalidRequest, msg);
        }
        suggestLinks(node.project, node);
        return node;
      }
      case 'get': {
        const data = parseArgs(GetNodeSchema, args);
        const result = GraphEngine.getNode(data);
        if (!result) {
          const projectSlug = getProjectSlug(data.project);
          const msg = findFuzzyNodeSuggestions(projectSlug, data.id);
          throw new McpError(ErrorCode.InvalidRequest, msg);
        }
        return result;
      }
      case 'remove': {
        const data = parseArgs(RemoveNodeSchema, args);
        const result = GraphEngine.removeNode(data);
        if (!result) {
          const projectSlug = getProjectSlug(data.project);
          const msg = findFuzzyNodeSuggestions(projectSlug, data.id);
          throw new McpError(ErrorCode.InvalidRequest, msg);
        }
        return result;
      }
      case 'list': {
        const data = parseArgs(ListNodesSchema, args);
        return QueryEngine.listNodes(data);
      }
      case 'search': {
        const data = parseArgs(SearchNodesSchema, args);
        return QueryEngine.searchNodes(data);
      }
      case 'batch_create': {
        const data = parseArgs(BatchCreateNodesSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return batchCreateNodes(db, {
          project: projectSlug,
          nodes: data.nodes,
        });
      }
      case 'batch_update': {
        const data = parseArgs(BatchUpdateSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return batchUpdate(db, {
          project: projectSlug,
          ids: data.ids,
          status: data.status,
          metadata: data.metadata,
          tags: data.tags,
        });
      }
      case 'add_note': {
        const data = parseArgs(AddNoteSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return db.transaction(() => {
          const node = GraphEngine.addNode({
            project: projectSlug,
            type: 'observation',
            title: data.text.slice(0, 200),
            metadata: { full_text: data.text },
            tags: data.tags,
          });
          if (data.attach_to) {
            EdgeEngine.addEdge({
              project: projectSlug,
              source_id: node.id,
              target_id: data.attach_to,
              type: 'references',
            });
          }
          return node;
        })();
      }
      default:
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid action "${action}" for manage_nodes. Supported actions: create, update, get, remove, list, search, batch_create, batch_update, add_note.`
        );
    }
  },
};
