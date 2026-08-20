export const READ_ONLY_TOOLS = new Set(['query_graph', 'get_analytics', 'get_events']);

export const READ_ONLY_ACTIONS = new Set([
  'manage_nodes:get',
  'manage_nodes:list',
  'manage_nodes:search',
  'manage_sessions:list',
  'manage_tasks:next',
  'manage_tasks:find_blocked',
  'manage_tasks:find_stale',
  'manage_tasks:find_blockers',
  'manage_tasks:find_similar_blockers',
  'manage_snapshots:list',
  'manage_snapshots:diff',
  'manage_snapshots:get_state',
  'manage_snapshots:get_history',
  'manage_specs:export',
  'manage_specs:compliance',
  'manage_database:audit',
  'manage_database:backup',
  'manage_database:branch_diff',
  'manage_data:export_graph',
  'manage_data:export_issues',
  'manage_data:export_trajectories',
  'manage_data:export_joint_trajectories',
  'manage_data:export_synergy_metrics',
  'query_graph:subgraph',
  'query_graph:trace',
  'query_graph:raw',
  'query_graph:natural_language',
  'get_analytics:summary',
  'get_analytics:velocity',
  'get_analytics:burndown',
  'get_analytics:value_metrics',
  'get_analytics:cognitive_load',
  'get_analytics:critical_path',
  'get_analytics:context_snapshot',
  'get_analytics:decision_trail',
  'get_analytics:find_related_decisions',
  'get_analytics:contradictions',
  'get_events:log',
  'get_events:changelog',
  'get_events:post_mortem',
  'run_diagnostics:validate',
  'run_diagnostics:doctor',
  'run_diagnostics:check_refs',
  'run_diagnostics:audit_chain',
  'run_diagnostics:version',
  'run_diagnostics:dedupe',
  'use_blackboard:read',
]);

export const DESTRUCTIVE_ACTIONS = new Set([
  'manage_nodes:remove',
  'manage_edges:remove',
  'manage_database:restore',
  'manage_snapshots:revert',
  'manage_snapshots:undo',
  'manage_data:import_graph',
  'run_diagnostics:prune_events',
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
    name: 'manage_nodes',
    description:
      'Manage graph nodes in the state graph. Supported actions: create (add single node), update (modify node properties), get (fetch node with edges), remove (delete node and cascade edges), list (filter nodes), search (FTS5 or TF-IDF search), batch_create (create multiple nodes atomically), batch_update (update multiple nodes atomically), add_note (log observation node with optional context link).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'create',
            'update',
            'get',
            'remove',
            'list',
            'search',
            'batch_create',
            'batch_update',
            'add_note',
          ],
          description: 'The node management action to execute.',
        },
        id: { type: 'string', description: 'Unique node identifier for get, update, or remove.' },
        type: {
          type: 'string',
          enum: [
            'task',
            'decision',
            'artifact',
            'plan',
            'milestone',
            'blocker',
            'observation',
            'spec',
            'requirement',
            'acceptance_criterion',
            'visual_state',
          ],
          description: 'The type classification of the node.',
        },
        title: { type: 'string', description: 'Title or label of the node.' },
        status: {
          type: 'string',
          description:
            'Status of the node (e.g. pending, in_progress, done, blocked, active, accepted, current).',
        },
        metadata: { type: 'object', description: 'Arbitrary structured key-value metadata.' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of searchable tags.',
        },
        query: { type: 'string', description: 'Search term for full-text search.' },
        algorithm: {
          type: 'string',
          enum: ['fts5', 'tfidf', 'hybrid'],
          description: 'Search algorithm for search action.',
        },
        nodes: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of node payloads for batch_create.',
        },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of node IDs for batch_update.',
        },
        text: { type: 'string', description: 'Text note content for add_note.' },
        attach_to: {
          type: 'string',
          description: 'Node ID to attach observation note to via references edge.',
        },
        git_branch: { type: 'string', description: 'Git branch filter.' },
        limit: { type: 'number', description: 'Maximum number of items to return (1-1000).' },
        offset: { type: 'number', description: 'Number of items to skip for pagination.' },
        compact: {
          type: 'boolean',
          description: 'Whether to return a lightweight compact summary.',
        },
        include_edges: {
          type: 'boolean',
          description: 'Whether to include inbound/outbound edges on get.',
        },
        expected_version: {
          type: 'number',
          description: 'Optimistic concurrency version check for update.',
        },
        session_id: {
          type: 'string',
          description: 'Active session identifier for change attribution.',
        },
        project: { type: 'string', description: 'Target project name or slug.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_edges',
    description:
      'Manage typed graph relationships between nodes. Supported actions: add (create typed relationship), remove (delete relationship), batch_add (create multiple relationships atomically), link_visual (link task or artifact to visual memory state).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'remove', 'batch_add', 'link_visual'],
          description: 'The edge management action to execute.',
        },
        source_id: { type: 'string', description: 'ID of the source node.' },
        target_id: { type: 'string', description: 'ID of the target node.' },
        type: {
          type: 'string',
          enum: [
            'depends_on',
            'blocks',
            'produces',
            'references',
            'updates',
            'contradicts',
            'part_of',
            'child_of',
            'implements',
            'decided_in',
            'extends',
            'modifies',
            'renders_state',
            'blocked_by_visual_state',
            'verifies_visual_state',
            'verifies',
            'satisfies',
          ],
          description: 'The semantic relationship type.',
        },
        properties: { type: 'object', description: 'Optional metadata properties for the edge.' },
        edges: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of edge objects for batch_add.',
        },
        visual_state_id: {
          type: 'string',
          description: 'Visual Memory snapshot/state ID for link_visual.',
        },
        relationship: {
          type: 'string',
          description:
            'Relationship type for link_visual (e.g. renders_state, blocked_by_visual_state).',
        },
        visual_description: {
          type: 'string',
          description: 'Optional text description for the visual state.',
        },
        source_url: {
          type: 'string',
          description: 'Optional URL where the visual state was captured.',
        },
        metadata: { type: 'object', description: 'Optional metadata for link_visual.' },
        project: { type: 'string', description: 'Target project name or slug.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_sessions',
    description:
      'Manage agent tracking sessions and multi-turn workflow attribution. Supported actions: start (begin tracked session), end (conclude session), list (view active/historical sessions), bootstrap (single-turn start + context snapshot + next tasks).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'end', 'list', 'bootstrap'],
          description: 'The session management action to execute.',
        },
        agent_id: {
          type: 'string',
          description: 'Agent identifier for session tracking and change attribution.',
        },
        session_id: { type: 'string', description: 'Unique session identifier for end.' },
        metadata: { type: 'object', description: 'Arbitrary session metadata.' },
        active_only: {
          type: 'boolean',
          description: 'Whether to return only active unclosed sessions on list.',
        },
        limit: { type: 'number', description: 'Maximum number of sessions to list (1-1000).' },
        task_limit: {
          type: 'number',
          description: 'Maximum runnable tasks to return on bootstrap.',
        },
        project: { type: 'string', description: 'Target project name or slug.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_tasks',
    description:
      'Task prioritization, workflow execution, blockers, and stale task management. Supported actions: next (query prioritized unblocked tasks), complete (mark done and optionally create artifact), find_blocked (find tasks blocked by a decision), find_stale (find idle/untouched tasks), find_blockers (find active blockers), find_similar_blockers (TF-IDF search for previously resolved blockers), auto_prune (cancel stale in-progress tasks).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'next',
            'complete',
            'find_blocked',
            'find_stale',
            'find_blockers',
            'find_similar_blockers',
            'auto_prune',
          ],
          description: 'The task management action to execute.',
        },
        task_id: { type: 'string', description: 'Task node ID to complete.' },
        decision_id: { type: 'string', description: 'Decision node ID for find_blocked.' },
        node_id: { type: 'string', description: 'Optional node ID to check blockers for.' },
        include_transitive: {
          type: 'boolean',
          description: 'Whether to include transitive blockers.',
        },
        query: { type: 'string', description: 'Query text for find_similar_blockers.' },
        threshold: {
          type: 'number',
          description: 'Similarity threshold for find_similar_blockers (0.0 - 1.0).',
        },
        older_than: {
          type: 'string',
          description: 'Duration threshold for staleness (e.g. 7d, 24h, 30m).',
        },
        target_status: {
          type: 'string',
          description: 'Target status to assign when auto-pruning (e.g. cancelled).',
        },
        artifact_title: {
          type: 'string',
          description: 'Optional title of artifact produced on complete.',
        },
        artifact_file_path: {
          type: 'string',
          description: 'Optional file path for produced artifact.',
        },
        artifact_metadata: {
          type: 'object',
          description: 'Optional metadata for produced artifact.',
        },
        visual_state_id: {
          type: 'string',
          description: 'Optional visual state ID to link on complete.',
        },
        visual_relationship: {
          type: 'string',
          description: 'Visual relationship for complete (default: renders_state).',
        },
        status: { type: 'string', description: 'Status filter for find_stale.' },
        type: { type: 'string', description: 'Node type filter for find_stale.' },
        git_branch: { type: 'string', description: 'Git branch filter.' },
        limit: { type: 'number', description: 'Maximum tasks to return (1-1000).' },
        include_context: {
          type: 'boolean',
          description: 'Whether to include parent plan/milestone and blocker context on next.',
        },
        project: { type: 'string', description: 'Target project name or slug.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_snapshots',
    description:
      'State checkpointing, time travel, diffing, and undo operations. Supported actions: save (create named checkpoint), list (list checkpoints), diff (compare two snapshots), get_state (reconstruct graph state at historical timestamp), revert (rollback graph to historical timestamp), undo (revert last mutation on a node), get_history (chronological audit log for a node).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['save', 'list', 'diff', 'get_state', 'revert', 'undo', 'get_history'],
          description: 'The snapshot management action to execute.',
        },
        session_id: { type: 'string', description: 'Optional session identifier for save.' },
        force: { type: 'boolean', description: 'Force snapshot even if node count is high.' },
        snapshot_id_a: { type: 'string', description: 'First snapshot ID for diff.' },
        snapshot_id_b: { type: 'string', description: 'Second snapshot ID for diff.' },
        timestamp: { type: 'string', description: 'ISO 8601 timestamp for get_state or revert.' },
        node_id: { type: 'string', description: 'Node ID for undo or get_history.' },
        limit: { type: 'number', description: 'Maximum snapshots to list (1-1000).' },
        project: { type: 'string', description: 'Target project name or slug.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_specs',
    description:
      'Spec-Driven Development (SDD) lifecycle and workflow template generation. Supported actions: scaffold (generate spec template in .specs/), ingest (parse PRD/Gherkin into graph nodes), export (export spec node back to Markdown/Gherkin), compliance (calculate requirement coverage matrix), verify (mark acceptance criterion verified/failing), decompose_feature (decompose feature into plan/milestones/subtasks), template (scaffold FDD or RFC template).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'scaffold',
            'ingest',
            'export',
            'compliance',
            'verify',
            'decompose_feature',
            'template',
          ],
          description: 'The specification or template action to execute.',
        },
        title: { type: 'string', description: 'Title of feature spec or template.' },
        name: { type: 'string', description: 'Name of template or feature.' },
        template: {
          type: 'string',
          enum: ['fdd', 'rfc'],
          description: 'Template type for template action.',
        },
        description: { type: 'string', description: 'Feature description for decompose_feature.' },
        subtasks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of subtask titles for decompose_feature.',
        },
        file_path: {
          type: 'string',
          description: 'File path of PRD or Gherkin feature for ingest.',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'gherkin', 'openspec'],
          description: 'Format of spec file.',
        },
        spec_id: { type: 'string', description: 'Spec node ID for export.' },
        criterion_id: { type: 'string', description: 'Acceptance criterion node ID for verify.' },
        status: {
          type: 'string',
          enum: ['verified', 'failing', 'skipped'],
          description: 'Verification status for verify.',
        },
        observation_id: {
          type: 'string',
          description: 'Optional observation node ID containing test proof.',
        },
        project: { type: 'string', description: 'Target project name or slug.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_database',
    description:
      'Physical SQLite database maintenance, backups, integrity checks, and Git VCS state sync. Supported actions: backup (online SQLite backup), restore (destructive restore from backup), audit (foreign keys and physical integrity check), merge (merge external SQLite state DB), branch_diff (diff state nodes across git branches), branch_merge (resolve graph conflicts during branch merge).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['backup', 'restore', 'audit', 'merge', 'branch_diff', 'branch_merge'],
          description: 'The database administration or VCS sync action to execute.',
        },
        outputPath: { type: 'string', description: 'Target destination file path for backup.' },
        backupPath: { type: 'string', description: 'Source backup file path for restore.' },
        sourcePath: { type: 'string', description: 'Source SQLite database path for merge.' },
        target_branch: {
          type: 'string',
          description: 'Target git branch to compare or merge against.',
        },
        source_branch: { type: 'string', description: 'Source git branch for branch_merge.' },
        resolution_strategy: {
          type: 'string',
          enum: ['ours', 'theirs', 'union'],
          description: 'Conflict resolution strategy for branch_merge.',
        },
        force: { type: 'boolean', description: 'Force overwrite during restore or merge.' },
        project: { type: 'string', description: 'Target project name or slug.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_data',
    description:
      'Export and import graph structures, issue tracker items, fine-tuning trajectories, and multimodal synergy metrics. Supported actions: export_graph (export to JSON/DOT/Mermaid/HTML), export_issues (export to GitHub/Jira JSON), export_trajectories (export JSONL fine-tuning data), export_joint_trajectories (export interleaved state + vision data), export_synergy_metrics (compute dual-memory metrics), import_graph (bulk import nodes & edges), import_issues (import GitHub/Jira issues), import_spec (import PRD/Gherkin spec).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'export_graph',
            'export_issues',
            'export_trajectories',
            'export_joint_trajectories',
            'export_synergy_metrics',
            'import_graph',
            'import_issues',
            'import_spec',
          ],
          description: 'The data export or import action to execute.',
        },
        format: {
          type: 'string',
          enum: [
            'json',
            'dot',
            'mermaid',
            'html',
            'github',
            'jira',
            'markdown',
            'gherkin',
            'openspec',
          ],
          description: 'Data format.',
        },
        session_id: { type: 'string', description: 'Session ID filter for trajectories.' },
        since: { type: 'string', description: 'Start timestamp for trajectories.' },
        until: { type: 'string', description: 'End timestamp for trajectories.' },
        limit: { type: 'number', description: 'Maximum items to export (1-1000).' },
        offset: { type: 'number', description: 'Offset for trajectories.' },
        nodes: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of node objects for import_graph.',
        },
        edges: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of edge objects for import_graph.',
        },
        issues: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of issue objects for import_issues.',
        },
        file_path: { type: 'string', description: 'File path for import_spec.' },
        force: { type: 'boolean', description: 'Force overwrite during import.' },
        project: { type: 'string', description: 'Target project name or slug.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'query_graph',
    description:
      'Query graph topology, neighborhoods, dependency paths, and safe read-only SQL queries. Supported actions: subgraph (fetch N-hop neighborhood around root node), trace (trace dependency chain upstream or downstream with cycle detection), raw (execute safe read-only SELECT query against SQLite), natural_language (translate natural language query into graph operations).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['subgraph', 'trace', 'raw', 'natural_language'],
          description: 'The graph query action to execute.',
        },
        root_id: { type: 'string', description: 'Root node ID for subgraph query.' },
        node_id: { type: 'string', description: 'Starting node ID for trace.' },
        direction: {
          type: 'string',
          enum: ['upstream', 'downstream'],
          description: 'Direction of dependency traversal for trace.',
        },
        edge_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Allowed edge types for trace (default: depends_on, blocks, child_of).',
        },
        depth: { type: 'number', description: 'Maximum depth for subgraph query (1-10).' },
        max_depth: { type: 'number', description: 'Maximum traversal depth for trace (1-50).' },
        sql: { type: 'string', description: 'Read-only SELECT query for raw action.' },
        params: {
          type: 'array',
          items: { type: 'string' },
          description: 'Query parameters for raw action.',
        },
        query: {
          type: 'string',
          description: 'Natural language search query for natural_language action.',
        },
        project: { type: 'string', description: 'Target project name or slug.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'get_analytics',
    description:
      'Compute workflow metrics, velocity, burndown, cognitive load, decision lineages, and contradiction audits. Supported actions: summary (project overview), velocity (throughput and duration), burndown (time-series remaining tasks chart), value_metrics (token savings and ROI), cognitive_load (ICL and ECL context complexity), critical_path (longest unfinished task chain), context_snapshot (consolidated overview), decision_trail (trace decision lineage), find_related_decisions (find decisions related to an artifact), contradictions (audit for conflicting decisions or broken states).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'summary',
            'velocity',
            'burndown',
            'value_metrics',
            'cognitive_load',
            'critical_path',
            'context_snapshot',
            'decision_trail',
            'find_related_decisions',
            'contradictions',
          ],
          description: 'The analytics or decision analysis action to execute.',
        },
        milestone_id: {
          type: 'string',
          description: 'Milestone ID for critical_path calculation.',
        },
        node_id: { type: 'string', description: 'Decision node ID for decision_trail.' },
        artifact_id: {
          type: 'string',
          description: 'Artifact node ID for find_related_decisions.',
        },
        window_days: {
          type: 'number',
          description: 'Number of days to analyze for velocity (default: 14).',
        },
        days: {
          type: 'number',
          description: 'Number of historical days for burndown (default: 14).',
        },
        project: { type: 'string', description: 'Target project name or slug.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'get_events',
    description:
      'Inspect the append-only event audit ledger, query structured changesets, and generate session post-mortems. Supported actions: log (query event ledger with filters), changelog (get structured graph diff since timestamp or session), post_mortem (analyze a session and produce a structured markdown report).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['log', 'changelog', 'post_mortem'],
          description: 'The event query action to execute.',
        },
        session_id: { type: 'string', description: 'Session ID for log or post_mortem.' },
        since: {
          type: 'string',
          description: 'ISO timestamp or relative duration (e.g. 2h, 1d) for log or changelog.',
        },
        since_session: { type: 'string', description: 'Session ID to diff from for changelog.' },
        until: { type: 'string', description: 'Ending ISO timestamp for log.' },
        git_branch: { type: 'string', description: 'Git branch filter for changelog.' },
        limit: { type: 'number', description: 'Maximum events to return (1-1000).' },
        offset: { type: 'number', description: 'Pagination offset for log.' },
        project: { type: 'string', description: 'Target project name or slug.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'run_diagnostics',
    description:
      'Run graph sanity checks, health diagnostics, reference validation, audit chain verification, and storage maintenance. Supported actions: validate (check cycles, orphans, dangling edges), doctor (database WAL mode, schema version, storage health), check_refs (validate file paths and AST symbols with auto-heal), audit_chain (verify SHA-256 event hash integrity), compact (reclaim SQLite storage), archive (archive old completed tasks), prune_events (permanently prune events - admin mode required), version (retrieve package version info), dedupe (detect and merge duplicate nodes).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'validate',
            'doctor',
            'check_refs',
            'audit_chain',
            'compact',
            'archive',
            'prune_events',
            'version',
            'dedupe',
          ],
          description: 'The diagnostic or maintenance action to execute.',
        },
        apply: {
          type: 'boolean',
          description: 'For dedupe action: whether to apply merging (default: false for dry-run).',
        },
        checks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional subset of validation checks.',
        },
        auto_heal: {
          type: 'boolean',
          description: 'Automatically fix broken file references on check_refs.',
        },
        prune_orphaned_edges: {
          type: 'boolean',
          description: 'Whether to prune dangling edges during compact.',
        },
        older_than_days: {
          type: 'number',
          description: 'Age threshold in days for archive (default: 30).',
        },
        older_than: {
          type: 'string',
          description: 'Age duration threshold for prune_events (e.g. 90d).',
        },
        dry_run: { type: 'boolean', description: 'Simulate event pruning without deleting.' },
        preserve_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Event types to preserve from pruning.',
        },
        project: { type: 'string', description: 'Target project name or slug.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'use_blackboard',
    description:
      'Multi-agent shared blackboard for asynchronous agent coordination. Supported actions: post (publish ephemeral notice with topic, content, and TTL expiration), read (read active non-expired blackboard notices).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['post', 'read'],
          description: 'The blackboard action to execute.',
        },
        topic: { type: 'string', description: 'Blackboard topic or channel name.' },
        content: { type: 'string', description: 'Message payload to post.' },
        agent_id: { type: 'string', description: 'Sender agent identifier.' },
        agent_role: {
          type: 'string',
          description: 'Sender agent role (e.g. planner, coder, reviewer).',
        },
        ttl_seconds: { type: 'number', description: 'Time-to-live in seconds (default: 3600).' },
        project: { type: 'string', description: 'Target project name or slug.' },
      },
      required: ['action'],
    },
  },
];
