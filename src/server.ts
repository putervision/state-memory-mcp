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
  StartSessionSchema,
  EndSessionSchema,
  GetEventLogSchema,
  GetNodeHistorySchema,
  UndoLastSchema,
  SaveSnapshotSchema,
  ListSnapshotsSchema,
  DiffSnapshotsSchema,
  ExportTrajectoriesSchema,
  BatchUpdateSchema,
  NextTasksSchema,
  WhatChangedSchema,
  GetStaleNodesSchema,
  ValidateGraphSchema,
  PruneEventsSchema,
  AddNoteSchema,
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
import { SessionEngine } from './engine/sessions.js';
import { EventEngine } from './engine/events.js';
import { SnapshotEngine } from './engine/snapshots.js';
import { TrajectoryEngine } from './engine/trajectories.js';
import { batchUpdate } from './engine/batch.js';
import { getNextTasks } from './engine/work-queue.js';
import { getChanges } from './engine/changeset.js';
import { getStaleNodes } from './engine/staleness.js';
import { validateGraph } from './engine/validate.js';
import { logger } from './utils/logger.js';
import { VERSION } from './utils/version.js';
import { parseArgs } from './handlers/helper.js';

/**
 * The Model Context Protocol (MCP) server instance for the state-memory-mcp toolset.
 * Exposes graph database operations, analytics, git scanning, and scaffolding tools.
 */
export const server = new Server(
  {
    name: 'state-memory-mcp',
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
      resources: { subscribe: true, listChanged: true },
      prompts: { listChanged: false },
    },
    instructions: `This server provides a workflow state graph to track tasks, decisions, blockers, artifacts, plans, and milestones.
Recommended workflow:
1. Always start by fetching the project summary via 'get_project_summary' or reading the summary resource 'state-memory:///{project}/summary'.
2. Check for active blockers using 'find_blockers' or the blockers resource 'state-memory:///{project}/blockers'.
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
              enum: ['depends_on', 'blocks', 'produces', 'references', 'decided_in', 'updates', 'contradicts', 'part_of', 'implements', 'child_of', 'extends', 'modifies', 'renders_state'],
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
            offset: {
              type: 'number',
              description: 'Offset for pagination. Defaults to 0.',
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
      {
        name: 'start_session',
        description: 'Start a new tracked session with agent identity and metadata.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            agent_id: {
              type: 'string',
              description: 'Optional identifier for the executing agent or user.',
            },
            metadata: {
              type: 'object',
              description: 'Optional session metadata.',
            },
          },
        },
      },
      {
        name: 'end_session',
        description: 'End an active tracked session.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            session_id: {
              type: 'string',
              description: 'The ID of the session to end.',
            },
          },
          required: ['session_id'],
        },
      },
      {
        name: 'list_sessions',
        description: 'List active and completed sessions for a project.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            active_only: {
              type: 'boolean',
              description: 'Optional filter to return only active (open) sessions.',
            },
            limit: {
              type: 'number',
              description: 'Optional maximum number of sessions to return (default 20).',
            },
          },
        },
      },
      {
        name: 'get_event_log',
        description: 'Query the project event log with filters.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            entity_id: {
              type: 'string',
              description: 'Optional filter by node or edge ID.',
            },
            event_type: {
              type: 'string',
              description: 'Optional filter by event type (e.g. node_created).',
            },
            session_id: {
              type: 'string',
              description: 'Optional filter by session ID.',
            },
            since: {
              type: 'string',
              description: 'Optional ISO 8601 start timestamp filter.',
            },
            until: {
              type: 'string',
              description: 'Optional ISO 8601 end timestamp filter.',
            },
            limit: {
              type: 'number',
              description: 'Optional limit (default 50).',
            },
            offset: {
              type: 'number',
              description: 'Optional offset.',
            },
          },
        },
      },
      {
        name: 'verify_audit_chain',
        description: 'Mathematically verify the cryptographic SHA-256 event audit chain for non-repudiable tamper resistance.',
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
        name: 'subscribe_context_changes',
        description: 'Subscribe to Context-Aware Shared Context Store (CA-MCP) state reactor triggers for constant O(1) LLM coordination.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            since_event_id: {
              type: 'number',
              description: 'Optional event ID to fetch changes since.',
            },
            since_timestamp: {
              type: 'string',
              description: 'Optional ISO 8601 timestamp to fetch changes since.',
            },
          },
        },
      },
      {
        name: 'traceback_to_node',
        description: 'Reset task execution state back to a prior validated node when downstream test/verification fails.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            target_node_id: {
              type: 'string',
              description: 'The target node ID to trace back to.',
            },
            reason: {
              type: 'string',
              description: 'Optional reason for the rollback.',
            },
          },
          required: ['target_node_id'],
        },
      },
      {
        name: 'get_cognitive_load',
        description: 'Calculate Intrinsic (ICL) and Extraneous (ECL) cognitive load metrics for the active task graph.',
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
        name: 'get_node_history',
        description: 'Get the full chronological mutation history of a specific node.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            node_id: {
              type: 'string',
              description: 'The unique ID of the node.',
            },
          },
          required: ['node_id'],
        },
      },
      {
        name: 'undo_last',
        description: 'Revert the last recorded mutation for a specific node.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            node_id: {
              type: 'string',
              description: 'The unique ID of the node.',
            },
          },
          required: ['node_id'],
        },
      },
      {
        name: 'save_snapshot',
        description: 'Save a persistent context snapshot of the current graph state.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            session_id: {
              type: 'string',
              description: 'Optional session ID to associate with the snapshot.',
            },
            force: {
              type: 'boolean',
              description: 'Force saving snapshot even if the graph is large.',
            },
          },
        },
      },
      {
        name: 'list_snapshots',
        description: 'List saved snapshots for the project.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            limit: {
              type: 'number',
              description: 'Optional limit (default 20).',
            },
          },
        },
      },
      {
        name: 'diff_snapshots',
        description: 'Compare two snapshots and return semantic node/edge changes.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            snapshot_id_a: {
              type: 'string',
              description: 'The first snapshot ID.',
            },
            snapshot_id_b: {
              type: 'string',
              description: 'The second snapshot ID.',
            },
          },
          required: ['snapshot_id_a', 'snapshot_id_b'],
        },
      },
      {
        name: 'export_trajectories',
        description: 'Export event transition logs in JSONL format for fine-tuning models.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            session_id: {
              type: 'string',
              description: 'Optional filter by session ID.',
            },
            since: {
              type: 'string',
              description: 'Optional start ISO 8601 timestamp.',
            },
            until: {
              type: 'string',
              description: 'Optional end ISO 8601 timestamp.',
            },
            limit: {
              type: 'number',
              description: 'Optional maximum number of events to export. Defaults to 10000.',
            },
            offset: {
              type: 'number',
              description: 'Optional offset for pagination. Defaults to 0.',
            },
          },
        },
      },
      {
        name: 'batch_update',
        description: 'Update the status, metadata, or tags of multiple nodes in a single atomic transaction. Max 100 IDs.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of node IDs to update.',
            },
            status: {
              type: 'string',
              description: 'Optional new status to apply to all nodes.',
            },
            metadata: {
              type: 'object',
              description: 'Optional metadata updates to merge into all nodes.',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional new list of tags to apply to all nodes.',
            },
          },
          required: ['ids'],
        },
      },
      {
        name: 'next_tasks',
        description: 'Get the next unblocked runnable tasks, ordered by blocking impact and age.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            git_branch: {
              type: 'string',
              description: 'Optional git branch name to filter by. Defaults to active branch.',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of tasks to return. Defaults to 5.',
            },
            include_context: {
              type: 'boolean',
              description: 'Whether to include blockers and downstream tasks in context. Defaults to false.',
            },
          },
        },
      },
      {
        name: 'what_changed',
        description: 'Retrieve a structured diff of all graph changes since a timestamp or session start.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            since: {
              type: 'string',
              description: 'ISO 8601 start timestamp.',
            },
            since_session: {
              type: 'string',
              description: 'Session ID to get changes since that session started.',
            },
            git_branch: {
              type: 'string',
              description: 'Optional git branch name to filter by.',
            },
          },
        },
      },
      {
        name: 'get_stale_nodes',
        description: 'Find nodes of a given status/type that have not been updated for a specified duration.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            older_than: {
              type: 'string',
              description: 'Minimum duration of inactivity, e.g., "7d", "24h", "30m". Defaults to "7d".',
            },
            status: {
              type: 'string',
              description: 'Status to filter by, or "*" for all. Defaults to "in_progress".',
            },
            type: {
              type: 'string',
              description: 'Optional node type to filter by.',
            },
            git_branch: {
              type: 'string',
              description: 'Optional git branch to filter by.',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return. Defaults to 20.',
            },
          },
        },
      },
      {
        name: 'validate_graph',
        description: 'Check the graph for logical issues (blocked done tasks, circular dependencies, empty milestones, orphan nodes, dangling edges).',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            checks: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['blocked_done', 'orphan_nodes', 'empty_milestones', 'stale_in_progress', 'missing_decisions', 'dangling_edges', 'cycle_check', 'unverified_ui'],
              },
              description: 'Specific validation checks to run. Runs all by default.',
            },
          },
        },
      },
      {
        name: 'prune_events',
        description: 'Prune old event log entries older than a specified duration, preserving the latest event for each entity.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            older_than: {
              type: 'string',
              description: 'Prune events older than this duration, e.g., "30d", "90d".',
            },
            dry_run: {
              type: 'boolean',
              description: 'Preview the count of events to be deleted without modifying the DB. Defaults to true.',
            },
            preserve_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Event types that should never be pruned.',
            },
          },
          required: ['older_than'],
        },
      },
      {
        name: 'add_note',
        description: 'Attach a quick developer note or observation to a node or the project.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Optional project identifier.',
            },
            text: {
              type: 'string',
              description: 'Observation note text.',
            },
            attach_to: {
              type: 'string',
              description: 'Optional target node ID to attach this note to.',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional tags to associate with this note.',
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'bootstrap_session',
        description: 'Single-turn session initialization combining start_session, context snapshot, and next unblocked tasks.',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Optional project identifier.' },
            agent_id: { type: 'string', description: 'Optional agent ID identifier.' },
            metadata: { type: 'object', description: 'Optional session metadata.' },
            task_limit: { type: 'number', description: 'Maximum number of next tasks to fetch (default: 5).' },
          },
        },
      },
      {
        name: 'complete_task',
        description: 'Single-turn task completion: updates task status to done, optionally creates an artifact node, and links them via a produces relationship.',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Optional project identifier.' },
            task_id: { type: 'string', description: 'Task node ID to complete.' },
            artifact_title: { type: 'string', description: 'Optional title for produced artifact.' },
            artifact_metadata: { type: 'object', description: 'Optional metadata for produced artifact.' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for artifact.' },
          },
          required: ['task_id'],
        },
      },
      {
        name: 'batch_create_nodes',
        description: 'Atomically create multiple nodes in a single transaction with FTS5 search index synchronization.',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Optional project identifier.' },
            nodes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', description: 'Node type (task, decision, artifact, etc.).' },
                  title: { type: 'string', description: 'Node title.' },
                  status: { type: 'string', description: 'Optional node status.' },
                  metadata: { type: 'object', description: 'Optional metadata object.' },
                  tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags.' },
                },
                required: ['type', 'title'],
              },
              description: 'Array of nodes to create.',
            },
          },
          required: ['nodes'],
        },
      },
      {
        name: 'batch_add_edges',
        description: 'Atomically add multiple edges with cycle detection and complete transaction rollback on failure.',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Optional project identifier.' },
            edges: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  source_id: { type: 'string', description: 'Source node ID.' },
                  target_id: { type: 'string', description: 'Target node ID.' },
                  type: { type: 'string', description: 'Edge relationship type.' },
                  properties: { type: 'object', description: 'Optional edge properties.' },
                },
                required: ['source_id', 'target_id', 'type'],
              },
              description: 'Array of edges to create.',
            },
          },
          required: ['edges'],
        },
      },
      {
        name: 'ingest_spec',
        description: 'Parse and ingest a Markdown PRD, OpenSpec, or Gherkin BDD specification file into graph nodes.',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Optional project identifier.' },
            file_path: { type: 'string', description: 'Absolute or relative path to spec file.' },
            format: { type: 'string', description: 'Optional spec format: markdown, gherkin, auto.' },
          },
          required: ['file_path'],
        },
      },
      {
        name: 'export_spec',
        description: 'Export a graph-managed specification node and child requirements back to clean Markdown or Gherkin text.',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Optional project identifier.' },
            spec_id: { type: 'string', description: 'Spec node ID to export.' },
            format: { type: 'string', description: 'Optional export format: markdown, gherkin.' },
          },
          required: ['spec_id'],
        },
      },
      {
        name: 'get_spec_compliance',
        description: 'Calculate real-time Spec Compliance matrix, requirement coverage ratio, and unfulfilled criteria.',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Optional project identifier.' },
          },
        },
      },
      {
        name: 'scaffold_spec',
        description: 'Scaffold a standard feature specification template in .specs/ and ingest it into memory.',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Optional project identifier.' },
            title: { type: 'string', description: 'Optional title of feature spec.' },
          },
        },
      },
      {
        name: 'verify_requirement',
        description: 'Mark an acceptance criterion as verified, failing, or skipped, optionally linking a test observation.',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Optional project identifier.' },
            criterion_id: { type: 'string', description: 'Acceptance criterion node ID.' },
            observation_id: { type: 'string', description: 'Optional observation node ID as proof.' },
            status: { type: 'string', description: 'Status: verified, failing, skipped.' },
          },
          required: ['criterion_id'],
        },
      },
    ];

    return {
      tools: tools.map(t => {
        const title = t.name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const isDestructive = ['remove_node', 'remove_edge', 'restore_project_db', 'import_graph', 'undo_last', 'prune_events'].includes(t.name);
        const isReadOnly = [
          'get_node', 'list_nodes', 'search_nodes', 'get_subgraph', 'trace_dependencies',
          'find_blockers', 'get_project_summary', 'decision_trail', 'critical_path',
          'impact_analysis', 'detect_contradictions', 'export_graph', 'query_graph',
          'backup_project_db', 'audit_project_db', 'get_context_snapshot',
          'find_related_decisions', 'find_blocked_tasks', 'value_metrics',
          'get_event_log', 'get_node_history', 'list_snapshots', 'diff_snapshots',
          'export_trajectories', 'next_tasks', 'what_changed', 'get_stale_nodes', 'validate_graph',
          'get_spec_compliance', 'export_spec'
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

import { toolHandlers } from './handlers/index.js';

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
    const pretty = (args as any)?.pretty_print === true;
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, pretty ? 2 : undefined);
    
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
        uri: `state-memory:///${projectSlug}/summary`,
        name: `${projectSlug} Summary`,
        mimeType: 'application/json',
        description: 'High-level project state overview'
      },
      {
        uri: `state-memory:///${projectSlug}/blockers`,
        name: `${projectSlug} Active Blockers`,
        mimeType: 'application/json',
        description: 'Currently active blocker nodes'
      },
      {
        uri: `state-memory:///${projectSlug}/tasks/next`,
        name: `${projectSlug} Next Tasks`,
        mimeType: 'application/json',
        description: 'Next unblocked runnable tasks'
      },
      {
        uri: `state-memory:///${projectSlug}/metrics`,
        name: `${projectSlug} Value Metrics`,
        mimeType: 'application/json',
        description: 'Project velocity and value creation metrics'
      },
      {
        uri: `state-memory:///${projectSlug}/decisions`,
        name: `${projectSlug} Decision Log`,
        mimeType: 'application/json',
        description: 'Recent accepted decisions'
      },
      {
        uri: `state-memory:///${projectSlug}/graph.json`,
        name: `${projectSlug} Graph Export (JSON)`,
        mimeType: 'application/json',
        description: 'Full node/edge graph export'
      },
      {
        uri: `state-memory:///${projectSlug}/events`,
        name: `${projectSlug} Event Log`,
        mimeType: 'application/json',
        description: 'Recent project state events'
      },
      {
        uri: `state-memory:///${projectSlug}/sessions`,
        name: `${projectSlug} Active Sessions`,
        mimeType: 'application/json',
        description: 'Recent agent/user sessions'
      }
    ]
  };
});

server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
  return {
    resourceTemplates: [
      {
        uriTemplate: 'state-memory:///{project}/summary',
        name: 'Project Summary Template',
        description: 'URI template for high-level project summary'
      },
      {
        uriTemplate: 'state-memory:///{project}/blockers',
        name: 'Project Active Blockers Template',
        description: 'URI template for currently active blocker nodes'
      },
      {
        uriTemplate: 'state-memory:///{project}/tasks/next',
        name: 'Project Next Tasks Template',
        description: 'URI template for top unblocked runnable tasks'
      },
      {
        uriTemplate: 'state-memory:///{project}/node/{id}',
        name: 'Project Node Details Template',
        description: 'URI template for individual node details and connected edges'
      },
      {
        uriTemplate: 'state-memory:///{project}/metrics',
        name: 'Project Metrics Template',
        description: 'URI template for value metrics and project velocity'
      },
      {
        uriTemplate: 'state-memory:///{project}/decisions',
        name: 'Project Decision Log Template',
        description: 'URI template for recent accepted decisions'
      },
      {
        uriTemplate: 'state-memory:///{project}/graph.json',
        name: 'Project Graph Export Template',
        description: 'URI template for full node/edge graph export'
      },
      {
        uriTemplate: 'state-memory:///{project}/events',
        name: 'Project Events Template',
        description: 'URI template for recent state-transition events'
      },
      {
        uriTemplate: 'state-memory:///{project}/sessions',
        name: 'Project Sessions Template',
        description: 'URI template for recent session history'
      }
    ]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const match = uri.match(/^state-memory:\/\/\/([a-zA-Z0-9-_]+)\/(summary|blockers|tasks\/next|metrics|decisions|graph\.json|events|sessions|node\/[a-zA-Z0-9-_]+)$/);
  if (!match) {
    throw new McpError(ErrorCode.InvalidRequest, `Invalid resource URI: ${uri}`);
  }

  const projectSlug = getProjectSlug(match[1]);
  const resourceType = match[2];

  let text = '';
  if (resourceType === 'summary') {
    const data = AnalyticsEngine.getProjectSummary({ project: projectSlug });
    text = JSON.stringify(data);
  } else if (resourceType === 'blockers') {
    const data = AnalyticsEngine.findBlockers({ project: projectSlug });
    text = JSON.stringify(data);
  } else if (resourceType === 'tasks/next') {
    const db = getDb(projectSlug);
    const data = getNextTasks(db, { project: projectSlug, limit: 10 });
    text = JSON.stringify(data);
  } else if (resourceType === 'metrics') {
    const data = AnalyticsEngine.valueMetrics({ project: projectSlug });
    text = JSON.stringify(data);
  } else if (resourceType.startsWith('node/')) {
    const nodeId = resourceType.replace('node/', '');
    const data = GraphEngine.getNode({ project: projectSlug, id: nodeId });
    text = JSON.stringify(data);
  } else if (resourceType === 'decisions') {
    const data = await QueryEngine.listNodes({ project: projectSlug, type: 'decision', status: 'accepted' });
    text = JSON.stringify(data.nodes);
  } else if (resourceType === 'graph.json') {
    const data = exportGraph({ project: projectSlug, format: 'json' });
    text = typeof data === 'string' ? data : JSON.stringify(data);
  } else if (resourceType === 'events') {
    const db = getDb(projectSlug);
    const data = EventEngine.getEventLog(db, { project: projectSlug, limit: 50 });
    text = JSON.stringify(data);
  } else if (resourceType === 'sessions') {
    const db = getDb(projectSlug);
    const data = SessionEngine.listSessions(db, { project: projectSlug, limit: 20 });
    text = JSON.stringify(data);
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
        name: 'handover-summary',
        description: 'Generates context summary for agent-to-agent session handoffs',
        arguments: [
          {
            name: 'project',
            description: 'Optional project identifier',
            required: false
          }
        ]
      },
      {
        name: 'task-decomposition',
        description: 'Guides breaking down a milestone into a task DAG with dependency links',
        arguments: [
          {
            name: 'milestone_title',
            description: 'The title of the milestone to decompose',
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
        name: 'post-mortem',
        description: 'Prompts analysis of cancelled or failed tasks and decision record updates',
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
            text: `Here is the current state-memory-mcp workflow status for project "${projectSlug}":\n\n${snapshot.formatted_summary}\n\nPlease review these blockers and pending tasks to determine the next work steps.`
          }
        }
      ]
    };
  }

  if (name === 'handover-summary') {
    const snapshot = AnalyticsEngine.getContextSnapshot({ project: projectSlug });
    const db = getDb(projectSlug);
    const recentEvents = EventEngine.getEventLog(db, { project: projectSlug, limit: 10 });

    return {
      description: 'Agent session handover summary',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Agent Handover Summary for project "${projectSlug}":\n\n${snapshot.formatted_summary}\n\nRecent Activity Log:\n${JSON.stringify(recentEvents)}\n\nPlease pick up execution from the remaining unblocked tasks.`
          }
        }
      ]
    };
  }

  if (name === 'task-decomposition') {
    const milestoneTitle = args?.milestone_title || 'New Milestone';
    return {
      description: `Task decomposition prompt for milestone: ${milestoneTitle}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Decompose the milestone "${milestoneTitle}" into actionable tasks for project "${projectSlug}".\n\n1. Use batch_create_nodes to create task nodes.\n2. Use batch_add_edges to link tasks using depends_on or child_of relationships.\n3. Validate the DAG using validate_graph.`
          }
        }
      ]
    };
  }

  if (name === 'post-mortem') {
    const db = getDb(projectSlug);
    const staleTasks = getStaleNodes(db, { project: projectSlug, status: 'in_progress', older_than: '1d' });
    return {
      description: 'Post-mortem analysis for project',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Conduct a post-mortem review for project "${projectSlug}".\n\nStale / In-Progress Tasks:\n${JSON.stringify(staleTasks)}\n\nAnalyze root causes, update decision records, and clean up abandoned task nodes.`
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
            text: `I need to plan the implementation of the feature: "${featureName}".\n\nUsing the state-memory-mcp toolset, guide me through:\n1. Creating a milestone node for this feature.\n2. Decomposing it into task nodes with estimated hours.\n3. Linking them using depends_on/part_of edges.\n4. Defining any upfront design decisions.`
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
            text: `Please review the decision log for project "${projectSlug}".\n\nAccepted Decisions:\n${JSON.stringify(summary.recent_decisions)}\n\nLogical Contradictions:\n${contradictionsText}\n\nSuggest any updates or corrections needed.`
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

