export const READ_ONLY_TOOLS = new Set([
  'get_node',
  'list_nodes',
  'search_nodes',
  'get_subgraph',
  'trace_dependencies',
  'find_blockers',
  'find_similar_blockers',
  'get_project_summary',
  'decision_trail',
  'critical_path',
  'impact_analysis',
  'detect_contradictions',
  'export_graph',
  'query_graph',
  'natural_language_query',
  'read_blackboard',
  'post_mortem_from_session',
  'get_state_at_timestamp',
  'validate_memory_references',
  'velocity_analytics',
  'burndown_chart',
  'export_issues',
  'vcs_branch_sync',
  'doctor_report',
  'watch_graph_changes',
  'backup_project_db',
  'audit_project_db',
  'get_context_snapshot',
  'find_related_decisions',
  'find_blocked_tasks',
  'value_metrics',
  'get_event_log',
  'get_node_history',
  'list_snapshots',
  'diff_snapshots',
  'export_trajectories',
  'next_tasks',
  'what_changed',
  'get_stale_nodes',
  'validate_graph',
  'get_spec_compliance',
  'export_spec',
  'export_joint_trajectories',
  'get_synergy_metrics',
  'app_version',
]);

export const DESTRUCTIVE_TOOLS = new Set([
  'remove_node',
  'remove_edge',
  'restore_project_db',
  'import_graph',
  'undo_last',
  'prune_events',
]);

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'add_node',
    description:
      'Create a new node in the workflow graph (e.g. task, decision, artifact, plan, blocker, milestone, observation).',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description:
            'Optional project identifier. If omitted, the project is auto-detected from the current working directory.',
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
          description:
            'Optional status (e.g., "pending", "in_progress", "done" for tasks). Defaults to the type-specific initial status.',
        },
        metadata: {
          type: 'object',
          description:
            'Optional metadata JSON object containing details specific to the node (e.g., description, priority, estimate, rationale).',
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
          description:
            "Optional metadata JSON object containing details to merge into the node's existing metadata.",
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
    description:
      'Get a single node by its unique ID, including all its connected inbound and outbound edges.',
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
          description:
            'Whether to include the inbound and outbound edges in the response. Defaults to true.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'remove_node',
    description:
      'Delete a node from the workflow graph. Connected relationships (edges) are cascade deleted automatically.',
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
    description:
      'Create a relationship/edge between two nodes. Cycles are rejected for depends_on, blocks, and child_of.',
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
          enum: [
            'depends_on',
            'blocks',
            'produces',
            'references',
            'decided_in',
            'updates',
            'contradicts',
            'part_of',
            'implements',
            'child_of',
            'extends',
            'modifies',
            'renders_state',
          ],
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
          description:
            'If true, metadata is omitted to optimize LLM token consumption. Defaults to false.',
        },
        git_branch: {
          type: 'string',
          description:
            'Optional Git branch name to filter by. Defaults to the active branch. Use "*" to list across all branches.',
        },
      },
    },
  },
  {
    name: 'search_nodes',
    description:
      'Search nodes using full-text search (FTS5) or local TF-IDF vector similarity across title, metadata, and tags.',
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
          description:
            'The search algorithm: "fts" (default, keyword full-text search) or "tfidf" (local TF-IDF vector similarity search).',
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
    description:
      'Trace dependency chains upstream (what depends_on or blocks) or downstream (what is blocked/depended on).',
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
    description:
      'List active blockers and the nodes they block, either project-wide or for a specific node.',
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
    name: 'find_similar_blockers',
    description:
      'Semantic TF-IDF search over solved blockers and observations to discover past resolution patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Optional project identifier.',
        },
        query: {
          type: 'string',
          description: 'Natural language description of the problem or blocker.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of matching blocker nodes to return. Defaults to 10.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'auto_prune_stale_tasks',
    description:
      'Automatically transition inactive in_progress tasks idle for longer than a specified threshold.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Optional project identifier.',
        },
        older_than: {
          type: 'string',
          description: 'Inactivity duration threshold (e.g. 7d, 24h). Defaults to 7d.',
        },
        target_status: {
          type: 'string',
          description: 'Status to set pruned tasks to. Defaults to cancelled.',
        },
      },
    },
  },
  {
    name: 'get_project_summary',
    description:
      'Retrieve a high-level project summary: counts, status breakdowns, progress, decisions, and blockers.',
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
    description:
      'Trace the full chain of decisions that led to a given state: what was decided, what it updated/superseded, and what it contradicts.',
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
    description:
      'Compute the longest dependency chain to a milestone — the minimum set of tasks that must complete.',
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
    description:
      'Scan for contradictions (tasks marked done but blocked, accepted contradicting decisions).',
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
    description:
      'Export project nodes and edges in JSON, DOT, Mermaid, or interactive HTML format.',
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
    description:
      'Bulk import nodes and edges (replaces existing project data, requires force parameter if data exists).',
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
    name: 'natural_language_query',
    description:
      'Query state graph using natural language free-text ("what is blocking auth?", "decisions led here").',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Optional project identifier.',
        },
        query: {
          type: 'string',
          description: 'Free-text natural language query.',
        },
        limit: {
          type: 'number',
          description: 'Optional maximum results to return.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'post_blackboard',
    description: 'Post an ephemeral message or state update to the multi-agent blackboard.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        agent_id: { type: 'string', description: 'Optional ID of posting agent.' },
        agent_role: {
          type: 'string',
          description: 'Optional role of posting agent (e.g. coder, reviewer, planner).',
        },
        topic: { type: 'string', description: 'Topic or channel for the message.' },
        content: { type: 'string', description: 'Content text or JSON payload of the message.' },
        ttl_seconds: {
          type: 'number',
          description: 'Optional time-to-live in seconds before message expires.',
        },
      },
      required: ['topic', 'content'],
    },
  },
  {
    name: 'read_blackboard',
    description: 'Read recent messages from the multi-agent blackboard.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        topic: { type: 'string', description: 'Optional topic filter.' },
        limit: { type: 'number', description: 'Optional max messages to return.' },
      },
    },
  },
  {
    name: 'plan_and_decompose_feature',
    description:
      'Atomically create a feature plan, optional milestone, subtasks, and dependency edges in a single turn.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        title: { type: 'string', description: 'Feature plan title.' },
        description: { type: 'string', description: 'Optional feature specification description.' },
        milestone_title: {
          type: 'string',
          description: 'Optional milestone title to group subtasks under.',
        },
        subtasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Subtask title.' },
              description: { type: 'string', description: 'Subtask description.' },
              depends_on_index: {
                type: 'number',
                description: 'Optional 0-based index of preceding subtask this task depends on.',
              },
            },
            required: ['title'],
          },
          description: 'List of subtask objects.',
        },
      },
      required: ['title', 'subtasks'],
    },
  },
  {
    name: 'post_mortem_from_session',
    description:
      'Analyze an agent session event log and generate a post-mortem observation and report artifact.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        session_id: { type: 'string', description: 'Target session ID.' },
        summary_title: { type: 'string', description: 'Optional summary report title.' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'get_state_at_timestamp',
    description:
      'Reconstruct historical state memory (nodes and edges) as it existed at a specific ISO timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        timestamp: {
          type: 'string',
          description: 'Target ISO timestamp (e.g. 2026-07-28T12:00:00Z).',
        },
      },
      required: ['timestamp'],
    },
  },
  {
    name: 'revert_to_timestamp',
    description:
      'Roll back state graph memory to a historical point in time, removing subsequent nodes and edges.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        timestamp: { type: 'string', description: 'Target ISO timestamp to revert back to.' },
        session_id: { type: 'string', description: 'Optional session ID for event logging.' },
      },
      required: ['timestamp'],
    },
  },
  {
    name: 'validate_memory_references',
    description:
      'Validate cross-memory references to external file paths and code symbols, optionally auto-healing broken links.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        auto_heal: {
          type: 'boolean',
          description: 'Optional flag to flag broken nodes with warning metadata.',
        },
      },
    },
  },
  {
    name: 'velocity_analytics',
    description:
      'Calculate velocity analytics, task completion rate, average cycle time, and daily throughput breakdown.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        window_days: { type: 'number', description: 'Optional time window in days (default 14).' },
      },
    },
  },
  {
    name: 'burndown_chart',
    description:
      'Generate burndown chart time-series data, remaining scope, and estimated completion date.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        days: { type: 'number', description: 'Optional timeframe in days (default 14).' },
      },
    },
  },
  {
    name: 'export_issues',
    description:
      'Export tasks and blockers as external issue tracker JSON payloads (GitHub Issues / Jira).',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        format: {
          type: 'string',
          enum: ['github', 'jira', 'generic'],
          description: 'Target issue tracker format (default github).',
        },
      },
    },
  },
  {
    name: 'import_issues',
    description:
      'Import external issue tracker issues (GitHub Issues / Jira) into state graph memory.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        issues: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              external_id: { type: 'string', description: 'External issue ID or number.' },
              title: { type: 'string', description: 'Issue title.' },
              body: { type: 'string', description: 'Issue description body.' },
              state: { type: 'string', description: 'Issue state (open/closed).' },
              labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels.' },
            },
            required: ['external_id', 'title'],
          },
        },
      },
      required: ['issues'],
    },
  },
  {
    name: 'vcs_branch_sync',
    description:
      'Analyze state memory nodes created or modified on the current git branch vs a target branch.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        target_branch: {
          type: 'string',
          description: 'Target git branch to compare against (default main).',
        },
      },
    },
  },
  {
    name: 'vcs_merge_resolution',
    description: 'Simulate or resolve state memory graph conflicts when merging Git branches.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        source_branch: { type: 'string', description: 'Source branch being merged.' },
        target_branch: { type: 'string', description: 'Target branch being merged into.' },
        strategy: {
          type: 'string',
          enum: ['auto_accept', 'flag_conflicts'],
          description: 'Conflict resolution strategy (default flag_conflicts).',
        },
      },
      required: ['source_branch', 'target_branch'],
    },
  },
  {
    name: 'compact_graph',
    description:
      'Rebuild database indexes, prune orphaned edges, and reclaim unused SQLite disk storage.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        prune_orphaned_edges: {
          type: 'boolean',
          description: 'Optional flag to prune orphaned edges (default false).',
        },
      },
    },
  },
  {
    name: 'archive_completed_nodes',
    description: 'Flag completed tasks updated before a specified cutoff threshold as archived.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        older_than_days: { type: 'number', description: 'Cutoff threshold in days (default 30).' },
      },
    },
  },
  {
    name: 'doctor_report',
    description:
      'Run system health diagnostics, check schema integrity, WAL status, orphaned edge counts, and generate recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
      },
    },
  },
  {
    name: 'watch_graph_changes',
    description:
      'Observe recent state graph mutations and event log entries since a timestamp or session.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        since_timestamp: {
          type: 'string',
          description: 'Optional ISO timestamp to filter events from.',
        },
        session_id: { type: 'string', description: 'Optional session ID to observe.' },
      },
    },
  },
  {
    name: 'backup_project_db',
    description: "Backup the project's sqlite database file to a target destination.",
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Optional project identifier.',
        },
        outputPath: {
          type: 'string',
          description:
            "Optional absolute path where the backup file should be saved. If omitted, a backup is created in the project's default backup folder.",
        },
      },
    },
  },
  {
    name: 'restore_project_db',
    description:
      "Restore the project's sqlite database from a backup file (destructively overwrites current project database).",
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
    description:
      "Audit the project's database for physical integrity, foreign key violations, orphaned edges, circular dependencies, and contradictions.",
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
    description:
      'Merge an external sqlite database file into the existing project database, resolving conflicts by keeping the newer updated_at nodes.',
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
          description:
            'Optional. If true, commits the merge even if circular dependencies are introduced.',
        },
      },
      required: ['sourcePath'],
    },
  },
  {
    name: 'get_context_snapshot',
    description:
      'Get a comprehensive high-level context snapshot combining summary, active blockers, and immediate pending tasks.',
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
    description:
      'Find all decisions that affected a given artifact (either directly produces it or decided_in a milestone that produces it).',
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
    description:
      'List all tasks that are currently blocked by a given decision node (either directly or transitively).',
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
    description:
      'Scaffold standard feature (fdd) or decision (rfc) workflow templates into the project graph.',
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
          description:
            'The template type: "fdd" (Feature-Driven Development design/build) or "rfc" (Request for Comments decision loop).',
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
    description:
      'Retrieve ROI and productivity health metrics for a project (e.g. estimated time and tokens saved, graph health).',
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
    description:
      'Mathematically verify the cryptographic SHA-256 event audit chain for non-repudiable tamper resistance.',
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
    description:
      'Subscribe to Context-Aware Shared Context Store (CA-MCP) state reactor triggers for constant O(1) LLM coordination.',
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
    description:
      'Reset task execution state back to a prior validated node when downstream test/verification fails.',
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
    description:
      'Calculate Intrinsic (ICL) and Extraneous (ECL) cognitive load metrics for the active task graph.',
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
    description:
      'Update the status, metadata, or tags of multiple nodes in a single atomic transaction. Max 100 IDs.',
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
          description:
            'Whether to include blockers and downstream tasks in context. Defaults to false.',
        },
      },
    },
  },
  {
    name: 'what_changed',
    description:
      'Retrieve a structured diff of all graph changes since a timestamp or session start.',
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
    description:
      'Find nodes of a given status/type that have not been updated for a specified duration.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Optional project identifier.',
        },
        older_than: {
          type: 'string',
          description:
            'Minimum duration of inactivity, e.g., "7d", "24h", "30m". Defaults to "7d".',
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
    description:
      'Check the graph for logical issues (blocked done tasks, circular dependencies, empty milestones, orphan nodes, dangling edges).',
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
            enum: [
              'blocked_done',
              'orphan_nodes',
              'empty_milestones',
              'stale_in_progress',
              'missing_decisions',
              'dangling_edges',
              'cycle_check',
              'unverified_ui',
            ],
          },
          description: 'Specific validation checks to run. Runs all by default.',
        },
      },
    },
  },
  {
    name: 'prune_events',
    description:
      'Prune old event log entries older than a specified duration, preserving the latest event for each entity.',
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
          description:
            'Preview the count of events to be deleted without modifying the DB. Defaults to true.',
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
    description:
      'Single-turn session initialization combining start_session, context snapshot, and next unblocked tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        agent_id: { type: 'string', description: 'Optional agent ID identifier.' },
        metadata: { type: 'object', description: 'Optional session metadata.' },
        task_limit: {
          type: 'number',
          description: 'Maximum number of next tasks to fetch (default: 5).',
        },
      },
    },
  },
  {
    name: 'complete_task',
    description:
      'Single-turn task completion: updates task status to done, optionally creates an artifact node, and links them via a produces relationship.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        task_id: { type: 'string', description: 'Task node ID to complete.' },
        artifact_title: { type: 'string', description: 'Optional title for produced artifact.' },
        artifact_metadata: {
          type: 'object',
          description: 'Optional metadata for produced artifact.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for artifact.',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'batch_create_nodes',
    description:
      'Atomically create multiple nodes in a single transaction with FTS5 search index synchronization.',
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
    description:
      'Atomically add multiple edges with cycle detection and complete transaction rollback on failure.',
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
    description:
      'Parse and ingest a Markdown PRD, OpenSpec, or Gherkin BDD specification file into graph nodes.',
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
    description:
      'Export a graph-managed specification node and child requirements back to clean Markdown or Gherkin text.',
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
    description:
      'Calculate real-time Spec Compliance matrix, requirement coverage ratio, and unfulfilled criteria.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
      },
    },
  },
  {
    name: 'scaffold_spec',
    description:
      'Scaffold a standard feature specification template in .specs/ and ingest it into memory.',
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
    description:
      'Mark an acceptance criterion as verified, failing, or skipped, optionally linking a test observation.',
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
  {
    name: 'link_visual_state',
    description:
      'Link a task or artifact to a visual memory state ID via renders_state, blocked_by_visual_state, or verifies_visual_state edge.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        target_id: { type: 'string', description: 'The task or artifact node ID in state memory.' },
        visual_state_id: { type: 'string', description: 'The visual state ID in vision memory.' },
        relationship: {
          type: 'string',
          enum: ['renders_state', 'blocked_by_visual_state', 'verifies_visual_state'],
          description: 'The edge type (default renders_state).',
        },
        visual_description: {
          type: 'string',
          description: 'Optional description of the visual state.',
        },
        source_url: { type: 'string', description: 'Optional source URL or page location.' },
        metadata: { type: 'object', description: 'Optional additional metadata.' },
      },
      required: ['target_id', 'visual_state_id'],
    },
  },
  {
    name: 'export_joint_trajectories',
    description:
      'Export unified, interleaved event and visual observation trajectories correlated by session ID for agent training.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
        session_id: { type: 'string', description: 'Optional session ID / trace ID to filter.' },
        limit: { type: 'number', description: 'Maximum steps to export (default 100).' },
      },
    },
  },
  {
    name: 'get_synergy_metrics',
    description:
      'Get combined dual-memory metrics: token savings, UI task verification ratio, and visual blocker health.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
      },
    },
  },
  {
    name: 'app_version',
    description: 'Get version, package name, MCP identifier, and server info of state-memory-mcp.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project identifier.' },
      },
    },
  },
];
