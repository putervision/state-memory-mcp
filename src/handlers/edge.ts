import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { AddEdgeSchema, RemoveEdgeSchema } from '../schema/schemas.js';
import { EdgeEngine } from '../engine/edges.js';
import { parseArgs } from './helper.js';

export const edgeHandlers = {
  add_edge: (args: any) => {
    const data = parseArgs(AddEdgeSchema, args);
    return EdgeEngine.addEdge(data);
  },
  remove_edge: (args: any) => {
    const data = parseArgs(RemoveEdgeSchema, args);
    const result = EdgeEngine.removeEdge(data);
    if (!result) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Edge not found: relationship from ${data.source_id} to ${data.target_id} of type ${data.type}`
      );
    }
    return { removed: true };
  },
};
