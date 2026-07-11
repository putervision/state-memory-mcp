import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  AddNodeSchema,
  UpdateNodeSchema,
  GetNodeSchema,
  RemoveNodeSchema,
  ListNodesSchema,
  SearchNodesSchema,
  GetNodeHistorySchema,
} from '../schema/schemas.js';
import { GraphEngine } from '../engine/graph.js';
import { QueryEngine } from '../engine/queries.js';
import { EventEngine } from '../engine/events.js';
import { getDb, getProjectSlug } from '../engine/db.js';
import { parseArgs, suggestLinks } from './helper.js';

export const nodeHandlers = {
  add_node: (args: any) => {
    const data = parseArgs(AddNodeSchema, args);
    const node = GraphEngine.addNode(data);
    suggestLinks(node.project, node);
    return node;
  },
  update_node: (args: any) => {
    const data = parseArgs(UpdateNodeSchema, args);
    const node = GraphEngine.updateNode(data);
    if (!node) {
      throw new McpError(ErrorCode.InvalidRequest, `Node not found: ${data.id}`);
    }
    suggestLinks(node.project, node);
    return node;
  },
  get_node: (args: any) => {
    const data = parseArgs(GetNodeSchema, args);
    const result = GraphEngine.getNode(data);
    if (!result) {
      throw new McpError(ErrorCode.InvalidRequest, `Node not found: ${data.id}`);
    }
    return result;
  },
  remove_node: (args: any) => {
    const data = parseArgs(RemoveNodeSchema, args);
    const result = GraphEngine.removeNode(data);
    if (!result) {
      throw new McpError(ErrorCode.InvalidRequest, `Node not found: ${data.id}`);
    }
    return result;
  },
  list_nodes: (args: any) => {
    const data = parseArgs(ListNodesSchema, args);
    return QueryEngine.listNodes(data);
  },
  search_nodes: (args: any) => {
    const data = parseArgs(SearchNodesSchema, args);
    return QueryEngine.searchNodes(data);
  },
  get_node_history: (args: any) => {
    const data = parseArgs(GetNodeHistorySchema, args);
    const projectSlug = getProjectSlug(data.project);
    const db = getDb(projectSlug);
    return EventEngine.getNodeHistory(db, {
      project: projectSlug,
      node_id: data.node_id,
    });
  },
};
