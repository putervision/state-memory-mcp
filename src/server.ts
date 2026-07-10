import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
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
  BackupProjectDbSchema,
  RestoreProjectDbSchema,
  AuditProjectDbSchema,
  MergeProjectDbSchema,
  GetContextSnapshotSchema,
  FindRelatedDecisionsSchema,
  FindBlockedTasksSchema,
  ScaffoldTemplateSchema,
  ValueMetricsSchema,
  ParseResult,
} from './schema/schemas.js';
import { GraphEngine } from './engine/graph.js';
import { EdgeEngine } from './engine/edges.js';
import { QueryEngine } from './engine/queries.js';
import { AnalyticsEngine } from './engine/analytics.js';
import { scaffoldTemplate } from './engine/scaffolder.js';
import { getDb, getProjectSlug } from './engine/db.js';
import { exportGraph } from './engine/export.js';
import { importGraph } from './engine/import.js';
import { backupProjectDb, restoreProjectDb } from './engine/backup.js';
import { auditProjectDb } from './engine/audit.js';
import { mergeProjectDb } from './engine/merge.js';
import { queryGraph } from './engine/query-raw.js';
import { logger } from './utils/logger.js';
import { VERSION } from './utils/version.js';

function parseArgs<T>(schema: { safeParse: (args: any) => ParseResult<T> }, args: any): T {
  const parsed = schema.safeParse(args);
  if (!parsed.success || !parsed.data) {
    const errorMsg = parsed.error?.errors.map((e) => e.message).join(', ') || 'Unknown validation error';
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid parameters: ${errorMsg}`
    );
  }
  return parsed.data;
}

/**
 * The Model Context Protocol (MCP) server instance for the state-graph-mcp toolset.
 * Exposes graph database operations, analytics, git scanning, and scaffolding tools.
 */
export const server = new Server(
  {
    name: 'state-graph-mcp',
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
      resources: { subscribe: false, listChanged: false },
      prompts: { listChanged: false },
    },
    instructions: `This server provides a workflow state graph to track tasks, decisions, blockers, artifacts, plans, and milestones.
Recommended workflow:
1. Always start by fetching the project summary via 'get_project_summary' or reading the summary resource 'state-graph:///{project}/summary'.
2. Check for active blockers using 'find_blockers' or the blockers resource 'state-graph:///{project}/blockers'.
3. Create new task, decision, and blocker nodes as you make progress, and link them using 'add_edge' relationships.
4. Keep the graph updated by changing task statuses to 'done' and marking resolved blockers.`,
  }
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = [
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
        description: 'Search nodes using full-text search (FTS5) or local TF-IDF vector similarity across title, metadata, and tags.',
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
            algorithm: {
              type: 'string',
              enum: ['fts', 'tfidf'],
              description: 'The search algorithm: "fts" (default, keyword full-text search) or "tfidf" (local TF-IDF vector similarity search).',
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
        description: 'Bulk import nodes and edges (replaces existing project data, requires force parameter if data exists).',
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
            force: {
              type: 'boolean',
              description: 'Force overwrite if the database already contains nodes or edges.',
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
      {
        name: 'backup_project_db',
        description: 'Backup the project\'s sqlite database file to a target destination.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            outputPath: {
              type: 'string',
              description: 'Optional absolute path where the backup file should be saved. If omitted, a backup is created in the project\'s default backup folder.',
            },
          },
        },
      },
      {
        name: 'restore_project_db',
        description: 'Restore the project\'s sqlite database from a backup file (destructively overwrites current project database).',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            backupPath: {
              type: 'string',
              description: 'The absolute path to the backup file to restore.',
            },
          },
          required: ['backupPath'],
        },
      },
      {
        name: 'audit_project_db',
        description: 'Audit the project\'s database for physical integrity, foreign key violations, orphaned edges, circular dependencies, and contradictions.',
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
        name: 'merge_project_db',
        description: 'Merge an external sqlite database file into the existing project database, resolving conflicts by keeping the newer updated_at nodes.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            sourcePath: {
              type: 'string',
              description: 'The absolute path to the source database file to merge from.',
            },
            force: {
              type: 'boolean',
              description: 'Optional. If true, commits the merge even if circular dependencies are introduced.',
            },
          },
          required: ['sourcePath'],
        },
      },
      {
        name: 'get_context_snapshot',
        description: 'Get a comprehensive high-level context snapshot combining summary, active blockers, and immediate pending tasks.',
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
        name: 'find_related_decisions',
        description: 'Find all decisions that affected a given artifact (either directly produces it or decided_in a milestone that produces it).',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            artifact_id: {
              type: 'string',
              description: 'The unique ID of the artifact node.',
            },
          },
          required: ['artifact_id'],
        },
      },
      {
        name: 'find_blocked_tasks',
        description: 'List all tasks that are currently blocked by a given decision node (either directly or transitively).',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            decision_id: {
              type: 'string',
              description: 'The unique ID of the decision node.',
            },
          },
          required: ['decision_id'],
        },
      },
      {
        name: 'scaffold_template',
        description: 'Scaffold standard feature (fdd) or decision (rfc) workflow templates into the project graph.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            template: {
              type: 'string',
              enum: ['fdd', 'rfc'],
              description: 'The template type: "fdd" (Feature-Driven Development design/build) or "rfc" (Request for Comments decision loop).',
            },
            name: {
              type: 'string',
              description: 'The name of the feature or RFC (e.g., "OAuth Login").',
            },
          },
          required: ['template', 'name'],
        },
      },
      {
        name: 'value_metrics',
        description: 'Retrieve ROI and productivity health metrics for a project (e.g. estimated time and tokens saved, graph health).',
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
    ];

    return {
      tools: tools.map(t => {
        const title = t.name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const isDestructive = ['remove_node', 'remove_edge', 'restore_project_db', 'import_graph'].includes(t.name);
        const isReadOnly = [
          'get_node', 'list_nodes', 'search_nodes', 'get_subgraph', 'trace_dependencies',
          'find_blockers', 'get_project_summary', 'decision_trail', 'critical_path',
          'impact_analysis', 'detect_contradictions', 'export_graph', 'query_graph',
          'backup_project_db', 'audit_project_db', 'get_context_snapshot',
          'find_related_decisions', 'find_blocked_tasks', 'value_metrics'
        ].includes(t.name);

        return {
          ...t,
          title,
          annotations: {
            readOnlyHint: isReadOnly,
            destructiveHint: isDestructive,
            openWorldHint: false
          }
        };
      })
    };
  });

function suggestLinks(projectSlug: string, node: any) {
  try {
    const db = getDb(projectSlug);
    const suggestions: string[] = [];
    if (node.type === 'decision') {
      const recentTasks = db.prepare(`
        SELECT id, title FROM nodes 
        WHERE project = ? AND type = 'task' AND status != 'done' AND status != 'cancelled'
        ORDER BY updated_at DESC LIMIT 3
      `).all(projectSlug) as any[];
      if (recentTasks.length > 0) {
        suggestions.push(`Consider linking decision "${node.title}" (${node.id}) to pending tasks using add_edge (type: 'decided_in' or 'blocks'):`);
        for (const t of recentTasks) {
          suggestions.push(`- Task: "${t.title}" (ID: ${t.id})`);
        }
      }
    } else if (node.type === 'task') {
      const recentDecisions = db.prepare(`
        SELECT id, title FROM nodes 
        WHERE project = ? AND type = 'decision' AND status = 'accepted'
        ORDER BY updated_at DESC LIMIT 3
      `).all(projectSlug) as any[];
      if (recentDecisions.length > 0) {
        suggestions.push(`Did task "${node.title}" (${node.id}) originate from a decision? Consider linking them via decided_in:`);
        for (const d of recentDecisions) {
          suggestions.push(`- Decision: "${d.title}" (ID: ${d.id})`);
        }
      }
    }
    if (suggestions.length > 0) {
      node._suggestions = suggestions;
    }
  } catch {
    // Ignore suggestion errors
  }
}

const toolHandlers: Record<string, (args: any) => Promise<any> | any> = {
  add_node: (args) => {
    const data = parseArgs(AddNodeSchema, args);
    const node = GraphEngine.addNode(data);
    suggestLinks(node.project, node);
    return node;
  },
  update_node: (args) => {
    const data = parseArgs(UpdateNodeSchema, args);
    const node = GraphEngine.updateNode(data);
    if (!node) {
      throw new McpError(ErrorCode.InvalidRequest, `Node not found: ${data.id}`);
    }
    suggestLinks(node.project, node);
    return node;
  },
  get_node: (args) => {
    const data = parseArgs(GetNodeSchema, args);
    const result = GraphEngine.getNode(data);
    if (!result) {
      throw new McpError(ErrorCode.InvalidRequest, `Node not found: ${data.id}`);
    }
    return result;
  },
  remove_node: (args) => {
    const data = parseArgs(RemoveNodeSchema, args);
    const result = GraphEngine.removeNode(data);
    if (!result) {
      throw new McpError(ErrorCode.InvalidRequest, `Node not found: ${data.id}`);
    }
    return result;
  },
  add_edge: (args) => {
    const data = parseArgs(AddEdgeSchema, args);
    return EdgeEngine.addEdge(data);
  },
  remove_edge: (args) => {
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
  list_nodes: (args) => {
    const data = parseArgs(ListNodesSchema, args);
    return QueryEngine.listNodes(data);
  },
  search_nodes: (args) => {
    const data = parseArgs(SearchNodesSchema, args);
    return QueryEngine.searchNodes(data);
  },
  get_subgraph: (args) => {
    const data = parseArgs(GetSubgraphSchema, args);
    return QueryEngine.getSubgraph(data);
  },
  trace_dependencies: (args) => {
    const data = parseArgs(TraceDependenciesSchema, args);
    return AnalyticsEngine.traceDependencies({
      ...data,
      direction: data.direction as 'upstream' | 'downstream',
    });
  },
  find_blockers: (args) => {
    const data = parseArgs(FindBlockersSchema, args);
    return AnalyticsEngine.findBlockers(data);
  },
  get_project_summary: (args) => {
    const data = parseArgs(GetProjectSummarySchema, args);
    return AnalyticsEngine.getProjectSummary(data);
  },
  decision_trail: (args) => {
    const data = parseArgs(DecisionTrailSchema, args);
    return AnalyticsEngine.decisionTrail(data);
  },
  critical_path: (args) => {
    const data = parseArgs(CriticalPathSchema, args);
    return AnalyticsEngine.criticalPath(data);
  },
  impact_analysis: (args) => {
    const data = parseArgs(ImpactAnalysisSchema, args);
    return AnalyticsEngine.impactAnalysis(data);
  },
  detect_contradictions: (args) => {
    const data = parseArgs(DetectContradictionsSchema, args);
    return AnalyticsEngine.detectContradictions(data);
  },
  export_graph: (args) => {
    const data = parseArgs(ExportGraphSchema, args);
    return exportGraph(data);
  },
  import_graph: (args) => {
    const data = parseArgs(ImportGraphSchema, args);
    return importGraph(data);
  },
  query_graph: (args) => {
    const data = parseArgs(QueryGraphSchema, args);
    return queryGraph(data);
  },
  backup_project_db: async (args) => {
    const data = parseArgs(BackupProjectDbSchema, args);
    const path = await backupProjectDb(data);
    return `Backup completed successfully! Saved to: ${path}`;
  },
  restore_project_db: (args) => {
    const data = parseArgs(RestoreProjectDbSchema, args);
    restoreProjectDb(data);
    return `Database restored successfully from: ${data.backupPath}`;
  },
  audit_project_db: (args) => {
    const data = parseArgs(AuditProjectDbSchema, args);
    return auditProjectDb(data);
  },
  merge_project_db: (args) => {
    const data = parseArgs(MergeProjectDbSchema, args);
    return mergeProjectDb(data);
  },
  get_context_snapshot: (args) => {
    const data = parseArgs(GetContextSnapshotSchema, args);
    const result = AnalyticsEngine.getContextSnapshot(data);
    return {
      content: [
        { type: 'text', text: JSON.stringify(result, null, 2) },
        { type: 'text', text: result.formatted_summary }
      ]
    };
  },
  find_related_decisions: (args) => {
    const data = parseArgs(FindRelatedDecisionsSchema, args);
    return AnalyticsEngine.findRelatedDecisions(data);
  },
  find_blocked_tasks: (args) => {
    const data = parseArgs(FindBlockedTasksSchema, args);
    return AnalyticsEngine.findBlockedTasks(data);
  },
  scaffold_template: (args) => {
    const data = parseArgs(ScaffoldTemplateSchema, args);
    return scaffoldTemplate({
      ...data,
      template: data.template as 'fdd' | 'rfc',
    });
  },
  value_metrics: (args) => {
    const data = parseArgs(ValueMetricsSchema, args);
    const result = AnalyticsEngine.valueMetrics(data);
    return {
      content: [
        { type: 'text', text: JSON.stringify(result, null, 2) },
        { type: 'text', text: result.markdown_summary }
      ]
    };
  },
};

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const handler = toolHandlers[name];
  if (!handler) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }

  try {
    const result = await handler(args);
    if (result && typeof result === 'object' && 'content' in result) {
      return result;
    }
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    
    return {
      content: [{ type: 'text', text }],
    };
  } catch (error: any) {
    logger.error(`Error executing tool ${name}:`, error);
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : String(error)
    );
  }
});

// Register Resource handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const projectSlug = getProjectSlug();
  return {
    resources: [
      {
        uri: `state-graph:///${projectSlug}/summary`,
        name: `${projectSlug} Summary`,
        mimeType: 'application/json',
        description: 'High-level project state overview'
      },
      {
        uri: `state-graph:///${projectSlug}/blockers`,
        name: `${projectSlug} Active Blockers`,
        mimeType: 'application/json',
        description: 'Currently active blocker nodes'
      },
      {
        uri: `state-graph:///${projectSlug}/decisions`,
        name: `${projectSlug} Decision Log`,
        mimeType: 'application/json',
        description: 'Recent accepted decisions'
      },
      {
        uri: `state-graph:///${projectSlug}/graph.json`,
        name: `${projectSlug} Graph Export (JSON)`,
        mimeType: 'application/json',
        description: 'Full node/edge graph export'
      }
    ]
  };
});

server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
  return {
    resourceTemplates: [
      {
        uriTemplate: 'state-graph:///{project}/summary',
        name: 'Project Summary Template',
        description: 'URI template for high-level project summary'
      },
      {
        uriTemplate: 'state-graph:///{project}/blockers',
        name: 'Project Active Blockers Template',
        description: 'URI template for currently active blocker nodes'
      },
      {
        uriTemplate: 'state-graph:///{project}/decisions',
        name: 'Project Decision Log Template',
        description: 'URI template for recent accepted decisions'
      },
      {
        uriTemplate: 'state-graph:///{project}/graph.json',
        name: 'Project Graph Export Template',
        description: 'URI template for full node/edge graph export'
      }
    ]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const match = uri.match(/^state-graph:\/\/\/([a-zA-Z0-9-_]+)\/(summary|blockers|decisions|graph\.json)$/);
  if (!match) {
    throw new McpError(ErrorCode.InvalidRequest, `Invalid resource URI: ${uri}`);
  }

  const projectSlug = match[1];
  const resourceType = match[2];

  let text = '';
  if (resourceType === 'summary') {
    const data = AnalyticsEngine.getProjectSummary({ project: projectSlug });
    text = JSON.stringify(data, null, 2);
  } else if (resourceType === 'blockers') {
    const data = AnalyticsEngine.findBlockers({ project: projectSlug });
    text = JSON.stringify(data, null, 2);
  } else if (resourceType === 'decisions') {
    const data = QueryEngine.listNodes({ project: projectSlug, type: 'decision', status: 'accepted' });
    text = JSON.stringify(data.nodes, null, 2);
  } else if (resourceType === 'graph.json') {
    const data = exportGraph({ project: projectSlug, format: 'json' });
    text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text
      }
    ]
  };
});

// Register Prompt handlers
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'session-start',
        description: 'Generate session startup context: summary + blockers + pending tasks',
        arguments: [
          {
            name: 'project',
            description: 'Optional project identifier',
            required: false
          }
        ]
      },
      {
        name: 'plan-feature',
        description: 'Guide creating a Feature-Driven Development (FDD) scaffold',
        arguments: [
          {
            name: 'feature_name',
            description: 'The name of the feature to plan',
            required: true
          },
          {
            name: 'project',
            description: 'Optional project identifier',
            required: false
          }
        ]
      },
      {
        name: 'review-decisions',
        description: 'Review recent decisions and check for logical contradictions',
        arguments: [
          {
            name: 'project',
            description: 'Optional project identifier',
            required: false
          }
        ]
      },
      {
        name: 'triage-blockers',
        description: 'Analyze blockers and suggest resolution strategies',
        arguments: [
          {
            name: 'project',
            description: 'Optional project identifier',
            required: false
          }
        ]
      }
    ]
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const projectSlug = getProjectSlug(args?.project);

  if (name === 'session-start') {
    const snapshot = AnalyticsEngine.getContextSnapshot({ project: projectSlug });
    return {
      description: 'Startup session overview',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Here is the current state-graph-mcp workflow status for project "${projectSlug}":\n\n${snapshot.formatted_summary}\n\nPlease review these blockers and pending tasks to determine the next work steps.`
          }
        }
      ]
    };
  }

  if (name === 'plan-feature') {
    const featureName = args?.feature_name;
    if (!featureName) {
      throw new McpError(ErrorCode.InvalidParams, 'Argument feature_name is required');
    }
    return {
      description: `Planning scaffold for feature: ${featureName}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I need to plan the implementation of the feature: "${featureName}".\n\nUsing the state-graph-mcp toolset, guide me through:\n1. Creating a milestone node for this feature.\n2. Decomposing it into task nodes with estimated hours.\n3. Linking them using depends_on/part_of edges.\n4. Defining any upfront design decisions.`
          }
        }
      ]
    };
  }

  if (name === 'review-decisions') {
    const summary = AnalyticsEngine.getProjectSummary({ project: projectSlug });
    const contradictions = AnalyticsEngine.detectContradictions({ project: projectSlug });
    
    let contradictionsText = 'No contradictions detected!';
    const totalAnomalies = contradictions.blocked_done_tasks.length + contradictions.contradicting_decisions.length;
    if (totalAnomalies > 0) {
      contradictionsText = `Detected ${totalAnomalies} logical anomalies:\n` +
        contradictions.blocked_done_tasks.map(t => `- Task "${t.task.title}" is done but blocked by "${t.blocker.title}"`).join('\n') + '\n' +
        contradictions.contradicting_decisions.map(d => `- Decision "${d.decision1.title}" contradicts decision "${d.decision2.title}"`).join('\n');
    }

    return {
      description: 'Decision log and contradictions audit',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please review the decision log for project "${projectSlug}".\n\nAccepted Decisions:\n${JSON.stringify(summary.recent_decisions, null, 2)}\n\nLogical Contradictions:\n${contradictionsText}\n\nSuggest any updates or corrections needed.`
          }
        }
      ]
    };
  }

  if (name === 'triage-blockers') {
    const blockers = AnalyticsEngine.findBlockers({ project: projectSlug });
    const blockersText = blockers.length > 0
      ? blockers.map(b => `- Blocker: "${b.blocker_node.title}" (Status: ${b.blocker_node.status})\n  Blocks: ${b.blocked_nodes.map(n => `"${n.node.title}" (depth ${n.depth})`).join(', ')}`).join('\n')
      : 'No active blockers!';

    return {
      description: 'Triage active blockers',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I need to triage the active blockers for project "${projectSlug}".\n\nActive Blockers:\n${blockersText}\n\nHelp me analyze the critical path and suggest mitigation strategies to resolve these blockers.`
          }
        }
      ]
    };
  }

  throw new McpError(ErrorCode.MethodNotFound, `Unknown prompt: ${name}`);
});
