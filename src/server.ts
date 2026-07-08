import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import {
  AddNodeSchema,
  GetNodeSchema,
  UpdateNodeSchema,
  RemoveNodeSchema,
  AddEdgeSchema,
  RemoveEdgeSchema,
  ListNodesSchema,
  SearchNodesSchema,
  GetSubgraphSchema,
  TraceDependenciesSchema,
  FindBlockersSchema,
  GetProjectSummarySchema,
  DecisionTrailSchema,
  CriticalPathSchema,
  ImpactAnalysisSchema,
  DetectContradictionsSchema,
  ExportGraphSchema,
  ImportGraphSchema,
  QueryGraphSchema,
} from './schema/zod.js';
import { GraphEngine } from './engine/graph.js';
import { EdgeEngine } from './engine/edges.js';
import { QueryEngine } from './engine/queries.js';
import { AnalyticsEngine } from './engine/analytics.js';
import { queryGraph, exportGraph, importGraph } from './engine/utils.js';
import { logger } from './utils/logger.js';

export const server = new Server(
  {
    name: 'state-graph-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'add_node',
        description: 'Create a new node in the workflow graph (e.g. task, decision, artifact, plan, blocker, milestone, observation).',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier. If omitted, the project is auto-detected from the current working directory.',
            },
            type: {
              type: 'string',
              enum: ['task', 'decision', 'artifact', 'plan', 'observation', 'blocker', 'milestone'],
              description: 'The type of node to create.',
            },
            title: {
              type: 'string',
              description: 'Short human-readable title/label for the node.',
            },
            status: {
              type: 'string',
              description: 'Optional status (e.g., "pending", "in_progress", "done" for tasks). Defaults to the type-specific initial status.',
            },
            metadata: {
              type: 'object',
              description: 'Optional metadata JSON object containing details specific to the node (e.g., description, priority, estimate, rationale).',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional tags for filtering and grouping.',
            },
          },
          required: ['type', 'title'],
        },
      },
      {
        name: 'update_node',
        description: 'Update properties of an existing node in the workflow graph.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            id: {
              type: 'string',
              description: 'The unique ID of the node to update.',
            },
            title: {
              type: 'string',
              description: 'Updated short human-readable title.',
            },
            status: {
              type: 'string',
              description: 'Updated status.',
            },
            metadata: {
              type: 'object',
              description: 'Optional metadata JSON object containing details to merge into the node\'s existing metadata.',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Updated tags list.',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'get_node',
        description: 'Get a single node by its unique ID, including all its connected inbound and outbound edges.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            id: {
              type: 'string',
              description: 'The unique ID of the node to retrieve.',
            },
            include_edges: {
              type: 'boolean',
              description: 'Whether to include the inbound and outbound edges in the response. Defaults to true.',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'remove_node',
        description: 'Delete a node from the workflow graph. Connected relationships (edges) are cascade deleted automatically.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            id: {
              type: 'string',
              description: 'The unique ID of the node to delete.',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'add_edge',
        description: 'Create a relationship/edge between two nodes. Cycles are rejected for depends_on, blocks, and child_of.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            source_id: {
              type: 'string',
              description: 'The source node ID.',
            },
            target_id: {
              type: 'string',
              description: 'The target node ID.',
            },
            type: {
              type: 'string',
              enum: ['depends_on', 'blocks', 'produces', 'references', 'decided_in', 'updates', 'contradicts', 'part_of', 'implements', 'child_of'],
              description: 'The relationship type.',
            },
            properties: {
              type: 'object',
              description: 'Optional edge properties/metadata JSON object.',
            },
          },
          required: ['source_id', 'target_id', 'type'],
        },
      },
      {
        name: 'remove_edge',
        description: 'Delete a specific relationship between two nodes.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            source_id: {
              type: 'string',
              description: 'The source node ID.',
            },
            target_id: {
              type: 'string',
              description: 'The target node ID.',
            },
            type: {
              type: 'string',
              description: 'The relationship type to delete.',
            },
          },
          required: ['source_id', 'target_id', 'type'],
        },
      },
      {
        name: 'list_nodes',
        description: 'List nodes with filtering by type, status, tags, and git branch.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            type: {
              type: 'string',
              enum: ['task', 'decision', 'artifact', 'plan', 'observation', 'blocker', 'milestone'],
              description: 'Optional node type to filter by.',
            },
            status: {
              type: 'string',
              description: 'Optional status to filter by.',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional tags (matches nodes having ALL specified tags).',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results. Defaults to 50.',
            },
            offset: {
              type: 'number',
              description: 'Pagination offset. Defaults to 0.',
            },
            compact: {
              type: 'boolean',
              description: 'If true, metadata is omitted to optimize LLM token consumption. Defaults to false.',
            },
            git_branch: {
              type: 'string',
              description: 'Optional Git branch name to filter by. Defaults to the active branch. Use "*" to list across all branches.',
            },
          },
        },
      },
      {
        name: 'search_nodes',
        description: 'Search nodes using full-text search (FTS5) across title, metadata, and tags.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            query: {
              type: 'string',
              description: 'The keyword search query.',
            },
            type: {
              type: 'string',
              enum: ['task', 'decision', 'artifact', 'plan', 'observation', 'blocker', 'milestone'],
              description: 'Optional node type to filter results.',
            },
            status: {
              type: 'string',
              description: 'Optional status to filter results.',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results. Defaults to 20.',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_subgraph',
        description: 'Retrieve a node and its N-hop neighborhood (nodes and connecting edges).',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            root_id: {
              type: 'string',
              description: 'The starting node ID.',
            },
            depth: {
              type: 'number',
              description: 'Traversed neighborhood depth. Default 2, maximum 5.',
            },
            edge_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional edge types to traverse. If omitted, all types are traversed.',
            },
            node_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional node types to include in returned set.',
            },
          },
          required: ['root_id'],
        },
      },
      {
        name: 'trace_dependencies',
        description: 'Trace dependency chains upstream (what depends_on or blocks) or downstream (what is blocked/depended on).',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            node_id: {
              type: 'string',
              description: 'The node ID to trace from.',
            },
            direction: {
              type: 'string',
              enum: ['upstream', 'downstream'],
              description: 'Trace direction (upstream = requirements; downstream = dependents).',
            },
            edge_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Edge types to follow. Defaults to [depends_on, blocks, child_of].',
            },
            max_depth: {
              type: 'number',
              description: 'Maximum depth. Default 10, maximum 20.',
            },
          },
          required: ['node_id', 'direction'],
        },
      },
      {
        name: 'find_blockers',
        description: 'List active blockers and the nodes they block, either project-wide or for a specific node.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            node_id: {
              type: 'string',
              description: 'Optional node ID to search active blockers for.',
            },
            include_transitive: {
              type: 'boolean',
              description: 'Whether to check for transitive blockers. Defaults to true.',
            },
          },
        },
      },
      {
        name: 'get_project_summary',
        description: 'Retrieve a high-level project summary: counts, status breakdowns, progress, decisions, and blockers.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
          },
        },
      },
      {
        name: 'decision_trail',
        description: 'Trace the full chain of decisions that led to a given state: what was decided, what it updated/superseded, and what it contradicts.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            node_id: {
              type: 'string',
              description: 'The decision node ID to trace from.',
            },
          },
          required: ['node_id'],
        },
      },
      {
        name: 'critical_path',
        description: 'Compute the longest dependency chain to a milestone — the minimum set of tasks that must complete.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            milestone_id: {
              type: 'string',
              description: 'The milestone node ID.',
            },
          },
          required: ['milestone_id'],
        },
      },
      {
        name: 'impact_analysis',
        description: 'Calculate downstream affected nodes if a target node is modified or deleted.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            node_id: {
              type: 'string',
              description: 'The node ID to run impact analysis for.',
            },
          },
          required: ['node_id'],
        },
      },
      {
        name: 'detect_contradictions',
        description: 'Scan for contradictions (tasks marked done but blocked, accepted contradicting decisions).',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
          },
        },
      },
      {
        name: 'export_graph',
        description: 'Export project nodes and edges in JSON, DOT, Mermaid, or interactive HTML format.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            format: {
              type: 'string',
              enum: ['json', 'dot', 'mermaid', 'html'],
              description: 'Export format. Defaults to json.',
            },
          },
        },
      },
      {
        name: 'import_graph',
        description: 'Bulk import nodes and edges (replaces existing project data).',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            nodes: {
              type: 'array',
              items: { type: 'object' },
              description: 'List of node objects.',
            },
            edges: {
              type: 'array',
              items: { type: 'object' },
              description: 'List of edge objects.',
            },
          },
          required: ['nodes', 'edges'],
        },
      },
      {
        name: 'query_graph',
        description: 'Run safe, read-only SELECT SQL queries against the graph database.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            sql: {
              type: 'string',
              description: 'The SELECT SQL query string.',
            },
            params: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional query parameter values.',
            },
          },
          required: ['sql'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'add_node': {
        const parsed = AddNodeSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const node = GraphEngine.addNode(parsed.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(node, null, 2) }],
        };
      }

      case 'update_node': {
        const parsed = UpdateNodeSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const node = GraphEngine.updateNode(parsed.data);
        if (!node) {
          throw new McpError(ErrorCode.InvalidRequest, `Node not found: ${parsed.data.id}`);
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(node, null, 2) }],
        };
      }

      case 'get_node': {
        const parsed = GetNodeSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const result = GraphEngine.getNode(parsed.data);
        if (!result) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Node not found: ${parsed.data.id}`
          );
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'remove_node': {
        const parsed = RemoveNodeSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const result = GraphEngine.removeNode(parsed.data);
        if (!result) {
          throw new McpError(ErrorCode.InvalidRequest, `Node not found: ${parsed.data.id}`);
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'add_edge': {
        const parsed = AddEdgeSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const edge = EdgeEngine.addEdge(parsed.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(edge, null, 2) }],
        };
      }

      case 'remove_edge': {
        const parsed = RemoveEdgeSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const removed = EdgeEngine.removeEdge(parsed.data);
        return {
          content: [{ type: 'text', text: JSON.stringify({ removed }, null, 2) }],
        };
      }

      case 'list_nodes': {
        const parsed = ListNodesSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const result = QueryEngine.listNodes(parsed.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'search_nodes': {
        const parsed = SearchNodesSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const result = QueryEngine.searchNodes(parsed.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'get_subgraph': {
        const parsed = GetSubgraphSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const result = QueryEngine.getSubgraph(parsed.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'trace_dependencies': {
        const parsed = TraceDependenciesSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const result = AnalyticsEngine.traceDependencies(parsed.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'find_blockers': {
        const parsed = FindBlockersSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const result = AnalyticsEngine.findBlockers(parsed.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'get_project_summary': {
        const parsed = GetProjectSummarySchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const result = AnalyticsEngine.getProjectSummary(parsed.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'decision_trail': {
        const parsed = DecisionTrailSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const result = AnalyticsEngine.decisionTrail(parsed.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'critical_path': {
        const parsed = CriticalPathSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const result = AnalyticsEngine.criticalPath(parsed.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'impact_analysis': {
        const parsed = ImpactAnalysisSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const result = AnalyticsEngine.impactAnalysis(parsed.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'detect_contradictions': {
        const parsed = DetectContradictionsSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const result = AnalyticsEngine.detectContradictions(parsed.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'export_graph': {
        const parsed = ExportGraphSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const result = exportGraph(parsed.data);
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'import_graph': {
        const parsed = ImportGraphSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const result = importGraph(parsed.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'query_graph': {
        const parsed = QueryGraphSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${parsed.error.errors.map((e) => e.message).join(', ')}`
          );
        }
        const result = queryGraph(parsed.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error: any) {
    logger.error(`Error executing tool ${name}:`, error);
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      error.message || 'Internal server error'
    );
  }
});

export { GraphEngine };
export { closeAllDbs };

