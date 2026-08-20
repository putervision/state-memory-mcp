/**
 * Dynamic Self-Healing & API Schema Advisor for state-memory-mcp
 *
 * Provides runtime auto-correction, smart action inference, alias resolution,
 * and structured schema guidance when an AI agent makes an invalid or ambiguous call.
 */

export interface ActionMetadata {
  description: string;
  required?: string[];
  optional?: string[];
  example: Record<string, any>;
  aliases?: string[];
}

export interface ToolActionMetadata {
  tool: string;
  description: string;
  actions: Record<string, ActionMetadata>;
  inferAction?: (args: Record<string, any>) => string | null;
}

export const TOOL_ACTION_REGISTRY: Record<string, ToolActionMetadata> = {
  manage_nodes: {
    tool: 'manage_nodes',
    description: 'Graph node CRUD, search, batch operations, and notes',
    actions: {
      create: {
        description: 'Create a new graph node (task, decision, artifact, blocker, etc.)',
        required: ['type', 'title'],
        optional: ['status', 'metadata', 'tags', 'project'],
        example: { action: 'create', project: 'my-app', type: 'task', title: 'Implement feature' },
        aliases: ['add', 'insert', 'new', 'post', 'save'],
      },
      update: {
        description: 'Update properties, metadata, or status of an existing node',
        required: ['id'],
        optional: ['title', 'status', 'metadata', 'tags', 'project', 'expected_version'],
        example: { action: 'update', project: 'my-app', id: '01KYBJ...', status: 'done' },
        aliases: ['edit', 'patch', 'modify', 'set', 'change'],
      },
      get: {
        description: 'Fetch single node details and optional connected edges',
        required: ['id'],
        optional: ['include_edges', 'project'],
        example: { action: 'get', project: 'my-app', id: '01KYBJ...', include_edges: true },
        aliases: ['read', 'view', 'fetch', 'show', 'details', 'find_by_id'],
      },
      remove: {
        description: 'Delete a node and its attached relationships',
        required: ['id'],
        optional: ['project'],
        example: { action: 'remove', project: 'my-app', id: '01KYBJ...' },
        aliases: ['delete', 'drop', 'del', 'destroy'],
      },
      list: {
        description: 'Filter and list graph nodes by type, status, or tags',
        optional: ['type', 'status', 'tags', 'limit', 'git_branch', 'compact', 'project'],
        example: { action: 'list', project: 'my-app', type: 'task', status: 'pending' },
        aliases: ['all', 'filter', 'query_all'],
      },
      search: {
        description: 'Full-text FTS5 or TF-IDF vector similarity search across nodes',
        required: ['query'],
        optional: ['algorithm', 'type', 'status', 'limit', 'project'],
        example: { action: 'search', project: 'my-app', query: 'authentication middleware' },
        aliases: ['find', 'lookup', 'vector_search', 'fts'],
      },
      batch_create: {
        description: 'Atomically insert multiple node objects in one transaction',
        required: ['nodes'],
        optional: ['project'],
        example: {
          action: 'batch_create',
          project: 'my-app',
          nodes: [
            { type: 'task', title: 'A' },
            { type: 'task', title: 'B' },
          ],
        },
        aliases: ['bulk_create', 'insert_many', 'batch_add'],
      },
      batch_update: {
        description: 'Atomically update status, tags, or metadata across multiple node IDs',
        required: ['ids'],
        optional: ['status', 'metadata', 'tags', 'project'],
        example: {
          action: 'batch_update',
          project: 'my-app',
          ids: ['01...', '02...'],
          status: 'done',
        },
        aliases: ['bulk_update', 'update_many'],
      },
      add_note: {
        description: 'Quickly record an observation node and optionally attach to a target node',
        required: ['text'],
        optional: ['attach_to', 'tags', 'project'],
        example: {
          action: 'add_note',
          project: 'my-app',
          text: 'Confirmed unit tests pass',
          attach_to: '01KYBJ...',
        },
        aliases: ['note', 'comment', 'log_note', 'observe'],
      },
    },
    inferAction: (args) => {
      if (Array.isArray(args.nodes)) return 'batch_create';
      if (Array.isArray(args.ids)) return 'batch_update';
      if (typeof args.text === 'string') return 'add_note';
      if (typeof args.query === 'string') return 'search';
      if (args.id && (args.status || args.title || args.metadata || args.tags)) return 'update';
      if (args.id) return 'get';
      if (args.type && args.title) return 'create';
      if (args.type || args.status || args.limit) return 'list';
      return null;
    },
  },

  manage_edges: {
    tool: 'manage_edges',
    description: 'Typed semantic relationships between graph nodes and visual state links',
    actions: {
      add: {
        description: 'Add a typed relationship edge between two nodes',
        required: ['source_id', 'target_id', 'type'],
        optional: ['properties', 'project'],
        example: {
          action: 'add',
          project: 'my-app',
          source_id: '01...',
          target_id: '02...',
          type: 'depends_on',
        },
        aliases: ['create', 'insert', 'connect', 'link', 'new'],
      },
      remove: {
        description: 'Remove a specific typed edge relationship',
        required: ['source_id', 'target_id', 'type'],
        optional: ['project'],
        example: {
          action: 'remove',
          project: 'my-app',
          source_id: '01...',
          target_id: '02...',
          type: 'depends_on',
        },
        aliases: ['delete', 'drop', 'unlink', 'disconnect'],
      },
      batch_add: {
        description: 'Atomically create multiple edge relationships in a single transaction',
        required: ['edges'],
        optional: ['project'],
        example: {
          action: 'batch_add',
          project: 'my-app',
          edges: [{ source_id: '01...', target_id: '02...', type: 'depends_on' }],
        },
        aliases: ['bulk_add', 'connect_many'],
      },
      link_visual: {
        description: 'Link task/artifact/blocker to a visual memory state ID',
        required: ['target_id', 'visual_state_id'],
        optional: ['relationship', 'visual_description', 'source_url', 'project'],
        example: {
          action: 'link_visual',
          project: 'my-app',
          target_id: '01...',
          visual_state_id: 'vs_header_01',
        },
        aliases: ['visual_link', 'attach_visual', 'link_visual_state'],
      },
    },
    inferAction: (args) => {
      if (Array.isArray(args.edges)) return 'batch_add';
      if (args.visual_state_id) return 'link_visual';
      if (args.source_id && args.target_id && args.type) return 'add';
      return null;
    },
  },

  manage_sessions: {
    tool: 'manage_sessions',
    description: 'Agent tracking session lifecycle and turn attribution',
    actions: {
      start: {
        description: 'Start tracking mutations under a unique session ID',
        required: ['agent_id'],
        optional: ['metadata', 'project'],
        example: { action: 'start', project: 'my-app', agent_id: 'cursor-agent' },
        aliases: ['begin', 'init', 'create', 'open', 'start_session'],
      },
      end: {
        description: 'Conclude a tracking session',
        optional: ['session_id', 'agent_id', 'project'],
        example: { action: 'end', project: 'my-app', session_id: '01KYBJ...' },
        aliases: ['finish', 'stop', 'close', 'terminate', 'conclude', 'end_session'],
      },
      list: {
        description: 'List historical and active tracking sessions',
        optional: ['limit', 'active_only', 'project'],
        example: { action: 'list', project: 'my-app', limit: 10 },
        aliases: ['all', 'history', 'list_sessions'],
      },
      bootstrap: {
        description: 'Single-turn session start returning context snapshot and prioritized tasks',
        optional: ['agent_id', 'task_limit', 'project'],
        example: { action: 'bootstrap', project: 'my-app', agent_id: 'agent-01' },
        aliases: ['init_session', 'bootstrap_session'],
      },
    },
    inferAction: (args) => {
      if (args.session_id && (args.close || args.stop || args.finish)) return 'end';
      if (args.agent_id && !args.session_id) return 'start';
      if (args.task_limit) return 'bootstrap';
      return null;
    },
  },

  manage_tasks: {
    tool: 'manage_tasks',
    description: 'Work queue scheduling, completion, and blocker management',
    actions: {
      next: {
        description: 'Retrieve prioritized runnable tasks',
        optional: ['limit', 'include_context', 'git_branch', 'project'],
        example: { action: 'next', project: 'my-app', limit: 5 },
        aliases: ['ready', 'runnable', 'queue', 'next_tasks'],
      },
      complete: {
        description: 'Mark a task done and optionally link produced artifact or visual proof',
        required: ['task_id'],
        optional: ['artifact_title', 'visual_state_id', 'visual_relationship', 'project'],
        example: {
          action: 'complete',
          project: 'my-app',
          task_id: '01KYBJ...',
          artifact_title: 'Auth Module',
        },
        aliases: ['done', 'finish', 'resolve', 'close', 'complete_task'],
      },
      find_blocked: {
        description: 'Find tasks blocked downstream by a decision or node',
        required: ['decision_id'],
        optional: ['project'],
        example: { action: 'find_blocked', project: 'my-app', decision_id: '01KYBJ...' },
        aliases: ['blocked_by', 'find_blocked_tasks'],
      },
      find_stale: {
        description: 'Identify untouched or idle tasks',
        optional: ['older_than', 'status', 'project'],
        example: { action: 'find_stale', project: 'my-app', older_than: '7d' },
        aliases: ['stale', 'get_stale_nodes'],
      },
      find_blockers: {
        description: 'Query active blockers on a node including transitive blockers',
        optional: ['node_id', 'include_transitive', 'project'],
        example: { action: 'find_blockers', project: 'my-app', node_id: '01KYBJ...' },
        aliases: ['blockers', 'active_blockers'],
      },
      find_similar_blockers: {
        description: 'RAG TF-IDF vector search for similar resolved blockers',
        required: ['query'],
        optional: ['threshold', 'project'],
        example: {
          action: 'find_similar_blockers',
          project: 'my-app',
          query: 'sqlite lock timeout',
        },
        aliases: ['similar_blockers'],
      },
      auto_prune: {
        description: 'Automatically transition stale tasks to a target status',
        optional: ['older_than', 'target_status', 'project'],
        example: {
          action: 'auto_prune',
          project: 'my-app',
          older_than: '14d',
          target_status: 'archived',
        },
        aliases: ['prune_stale', 'auto_prune_stale_tasks'],
      },
    },
    inferAction: (args) => {
      if (args.task_id) return 'complete';
      if (args.decision_id) return 'find_blocked';
      if (args.node_id) return 'find_blockers';
      if (args.query) return 'find_similar_blockers';
      if (args.older_than && args.target_status) return 'auto_prune';
      if (args.older_than) return 'find_stale';
      return 'next';
    },
  },

  manage_snapshots: {
    tool: 'manage_snapshots',
    description: 'Graph checkpoints, time travel, historical diffs, and node rollback',
    actions: {
      save: {
        description: 'Save named snapshot checkpoint of the graph',
        optional: ['session_id', 'force', 'project'],
        example: { action: 'save', project: 'my-app' },
        aliases: ['create', 'checkpoint', 'take', 'save_snapshot'],
      },
      list: {
        description: 'View saved snapshots',
        optional: ['limit', 'project'],
        example: { action: 'list', project: 'my-app', limit: 10 },
        aliases: ['all', 'list_snapshots'],
      },
      diff: {
        description: 'Compare two snapshot states',
        required: ['snapshot_id_a', 'snapshot_id_b'],
        optional: ['project'],
        example: {
          action: 'diff',
          project: 'my-app',
          snapshot_id_a: 'snap_1',
          snapshot_id_b: 'snap_2',
        },
        aliases: ['compare', 'diff_snapshots'],
      },
      get_state: {
        description: 'Query graph state at an ISO timestamp',
        required: ['timestamp'],
        optional: ['project'],
        example: { action: 'get_state', project: 'my-app', timestamp: '2026-08-19T00:00:00Z' },
        aliases: ['state_at'],
      },
      revert: {
        description: 'Roll back graph to a historical timestamp',
        required: ['timestamp'],
        optional: ['project'],
        example: { action: 'revert', project: 'my-app', timestamp: '2026-08-19T00:00:00Z' },
        aliases: ['rollback', 'restore_state'],
      },
      undo: {
        description: 'Undo last mutation on a node',
        required: ['node_id'],
        optional: ['project'],
        example: { action: 'undo', project: 'my-app', node_id: '01KYBJ...' },
        aliases: ['undo_last', 'revert_node'],
      },
      get_history: {
        description: 'Retrieve chronological audit history for a node',
        required: ['node_id'],
        optional: ['project'],
        example: { action: 'get_history', project: 'my-app', node_id: '01KYBJ...' },
        aliases: ['history', 'node_history', 'get_node_history'],
      },
    },
    inferAction: (args) => {
      if (args.snapshot_id_a && args.snapshot_id_b) return 'diff';
      if (args.snapshot_a && args.snapshot_b) return 'diff';
      if (args.timestamp && args.revert) return 'revert';
      if (args.timestamp) return 'get_state';
      if (args.node_id && args.history) return 'get_history';
      if (args.node_id) return 'undo';
      return null;
    },
  },

  manage_specs: {
    tool: 'manage_specs',
    description: 'Spec-Driven Development (SDD) PRD lifecycle and workflow templates',
    actions: {
      scaffold: {
        description: 'Generate a feature spec template in .specs/',
        required: ['title'],
        optional: ['project'],
        example: { action: 'scaffold', project: 'my-app', title: 'OAuth2 Authentication' },
        aliases: ['init', 'create', 'scaffold_spec'],
      },
      ingest: {
        description: 'Parse PRD or Gherkin file into graph nodes',
        required: ['file_path'],
        optional: ['format', 'project'],
        example: { action: 'ingest', project: 'my-app', file_path: '.specs/oauth.md' },
        aliases: ['parse', 'import', 'ingest_spec'],
      },
      export: {
        description: 'Export spec node hierarchy back to file',
        required: ['spec_id'],
        optional: ['format', 'output_path', 'project'],
        example: { action: 'export', project: 'my-app', spec_id: '01KYBJ...' },
        aliases: ['export_spec', 'write_spec'],
      },
      compliance: {
        description: 'Compute requirement verification coverage matrix',
        optional: ['spec_id', 'project'],
        example: { action: 'compliance', project: 'my-app' },
        aliases: ['matrix', 'coverage', 'status', 'get_spec_compliance'],
      },
      verify: {
        description: 'Mark acceptance criterion verified, failing, or skipped',
        required: ['criterion_id'],
        optional: ['status', 'observation_id', 'project'],
        example: {
          action: 'verify',
          project: 'my-app',
          criterion_id: '01KYBJ...',
          status: 'verified',
        },
        aliases: ['check', 'pass', 'fail', 'verify_requirement'],
      },
      decompose_feature: {
        description: 'Decompose feature into plan, milestone, and subtasks',
        required: ['title'],
        optional: ['description', 'subtasks', 'project'],
        example: {
          action: 'decompose_feature',
          project: 'my-app',
          title: 'User Profiles',
          subtasks: ['DB Schema', 'API Route'],
        },
        aliases: ['decompose', 'breakdown', 'plan_and_decompose_feature'],
      },
      template: {
        description: 'Scaffold FDD or RFC template',
        required: ['template', 'name'],
        optional: ['project'],
        example: { action: 'template', project: 'my-app', template: 'fdd', name: 'Billing' },
        aliases: ['scaffold_template', 'workflow_template'],
      },
    },
    inferAction: (args) => {
      if (args.criterion_id) return 'verify';
      if (args.spec_id && !args.file_path) return 'export';
      if (args.file_path) return 'ingest';
      if (args.subtasks) return 'decompose_feature';
      if (args.template && args.name) return 'template';
      if (args.title) return 'scaffold';
      return 'compliance';
    },
  },

  manage_database: {
    tool: 'manage_database',
    description: 'SQLite database backups, integrity audits, and Git VCS sync',
    actions: {
      backup: {
        description: 'Create an online SQLite backup file',
        required: ['outputPath'],
        optional: ['project'],
        example: { action: 'backup', project: 'my-app', outputPath: './backup.db' },
        aliases: ['dump', 'save', 'backup_project_db'],
      },
      restore: {
        description: 'Restore database from backup file',
        required: ['backupPath'],
        optional: ['force', 'project'],
        example: { action: 'restore', project: 'my-app', backupPath: './backup.db' },
        aliases: ['load', 'restore_project_db'],
      },
      audit: {
        description: 'Integrity checks and foreign key validation',
        optional: ['project'],
        example: { action: 'audit', project: 'my-app' },
        aliases: ['check', 'integrity', 'audit_project_db'],
      },
      merge: {
        description: 'Merge external SQLite state database',
        required: ['sourcePath'],
        optional: ['force', 'project'],
        example: { action: 'merge', project: 'my-app', sourcePath: './other.db' },
        aliases: ['merge_project_db'],
      },
      branch_diff: {
        description: 'Diff graph state across git branches',
        required: ['target_branch'],
        optional: ['project'],
        example: { action: 'branch_diff', project: 'my-app', target_branch: 'main' },
        aliases: ['diff_branches'],
      },
      branch_merge: {
        description: 'Merge branch state and resolve conflicts',
        required: ['source_branch', 'target_branch', 'resolution_strategy'],
        optional: ['project'],
        example: {
          action: 'branch_merge',
          project: 'my-app',
          source_branch: 'feature',
          target_branch: 'main',
          resolution_strategy: 'union',
        },
        aliases: ['merge_branch_state'],
      },
    },
    inferAction: (args) => {
      if (args.outputPath) return 'backup';
      if (args.backupPath) return 'restore';
      if (args.sourcePath) return 'merge';
      if (args.source_branch && args.target_branch) return 'branch_merge';
      if (args.target_branch) return 'branch_diff';
      return 'audit';
    },
  },

  manage_data: {
    tool: 'manage_data',
    description: 'Bulk import and export operations (JSON, DOT, Mermaid, Trajectories, Synergy)',
    actions: {
      export_graph: {
        description: 'Export graph in JSON, DOT, Mermaid, or HTML format',
        optional: ['format', 'outputPath', 'project'],
        example: { action: 'export_graph', project: 'my-app', format: 'mermaid' },
        aliases: ['export', 'dump_graph'],
      },
      export_issues: {
        description: 'Export tasks in GitHub or Jira format',
        optional: ['format', 'outputPath', 'project'],
        example: { action: 'export_issues', project: 'my-app', format: 'github' },
        aliases: ['export_github', 'export_jira'],
      },
      export_trajectories: {
        description: 'Export agent trajectories as JSONL fine-tuning data',
        optional: ['limit', 'session_id', 'since', 'until', 'outputPath', 'project'],
        example: { action: 'export_trajectories', project: 'my-app', limit: 100 },
        aliases: ['trajectories', 'export_logs'],
      },
      export_joint_trajectories: {
        description: 'Export interleaved state + visual trajectories',
        optional: ['limit', 'session_id', 'outputPath', 'project'],
        example: { action: 'export_joint_trajectories', project: 'my-app' },
        aliases: ['joint_trajectories', 'multimodal_trajectories'],
      },
      export_synergy_metrics: {
        description: 'Retrieve dual-memory synergy and ROI metrics',
        optional: ['project'],
        example: { action: 'export_synergy_metrics', project: 'my-app' },
        aliases: ['synergy_metrics', 'get_synergy_metrics'],
      },
      import_graph: {
        description: 'Bulk import nodes and edges',
        required: ['nodes', 'edges'],
        optional: ['force', 'project'],
        example: { action: 'import_graph', project: 'my-app', nodes: [], edges: [] },
        aliases: ['import', 'bulk_import'],
      },
      import_issues: {
        description: 'Bulk import external issues into tasks',
        required: ['issues'],
        optional: ['project'],
        example: { action: 'import_issues', project: 'my-app', issues: [] },
        aliases: ['import_github_issues', 'import_jira_issues'],
      },
      import_spec: {
        description: 'Import PRD or Gherkin spec',
        required: ['file_path'],
        optional: ['format', 'project'],
        example: { action: 'import_spec', project: 'my-app', file_path: './spec.md' },
        aliases: ['import_prd'],
      },
    },
    inferAction: (args) => {
      if (Array.isArray(args.issues)) return 'import_issues';
      if (Array.isArray(args.nodes) && Array.isArray(args.edges)) return 'import_graph';
      if (args.file_path) return 'import_spec';
      if (args.format === 'github' || args.format === 'jira') return 'export_issues';
      if (args.format === 'joint' || args.joint) return 'export_joint_trajectories';
      if (args.format === 'jsonl' || args.trajectories) return 'export_trajectories';
      if (args.synergy || args.roi) return 'export_synergy_metrics';
      return 'export_graph';
    },
  },

  query_graph: {
    tool: 'query_graph',
    description:
      'Graph neighborhood extraction, dependency tracing, SQL, and natural language queries',
    actions: {
      subgraph: {
        description: 'Extract N-hop neighborhood around root node',
        required: ['root_id'],
        optional: ['depth', 'project'],
        example: { action: 'subgraph', project: 'my-app', root_id: '01KYBJ...', depth: 2 },
        aliases: ['neighborhood', 'get_subgraph'],
      },
      trace: {
        description: 'Trace dependency chains upstream or downstream with cycle detection',
        required: ['node_id'],
        optional: ['direction', 'max_depth', 'project'],
        example: {
          action: 'trace',
          project: 'my-app',
          node_id: '01KYBJ...',
          direction: 'downstream',
        },
        aliases: ['trace_dependencies', 'dependency_trace'],
      },
      raw: {
        description: 'Execute safe read-only SELECT query against SQLite',
        required: ['sql'],
        optional: ['params', 'project'],
        example: {
          action: 'raw',
          project: 'my-app',
          sql: 'SELECT * FROM nodes WHERE status = ?',
          params: ['pending'],
        },
        aliases: ['sql', 'query_raw'],
      },
      natural_language: {
        description: 'Execute natural language query against graph state',
        required: ['query'],
        optional: ['project'],
        example: {
          action: 'natural_language',
          project: 'my-app',
          query: 'What tasks are blocking the release?',
        },
        aliases: ['ask', 'nl_query'],
      },
    },
    inferAction: (args) => {
      if (args.sql) return 'raw';
      if (args.root_id) return 'subgraph';
      if (args.node_id || args.direction) return 'trace';
      if (args.query) return 'natural_language';
      return null;
    },
  },

  get_analytics: {
    tool: 'get_analytics',
    description: 'Workflow analytics, burndown, cognitive load, and decision trails',
    actions: {
      summary: {
        description: 'Overview of nodes, edges, blockers, and completion %',
        optional: ['project'],
        example: { action: 'summary', project: 'my-app' },
        aliases: ['overview', 'get_project_summary', 'status'],
      },
      velocity: {
        description: 'Task completion velocity and duration stats',
        optional: ['window_days', 'project'],
        example: { action: 'velocity', project: 'my-app', window_days: 14 },
        aliases: ['speed', 'throughput'],
      },
      burndown: {
        description: 'Time-series remaining task estimates',
        optional: ['days', 'project'],
        example: { action: 'burndown', project: 'my-app', days: 30 },
        aliases: ['chart', 'remaining'],
      },
      value_metrics: {
        description: 'Token savings, ROI, and efficiency calculations',
        optional: ['project'],
        example: { action: 'value_metrics', project: 'my-app' },
        aliases: ['roi', 'savings'],
      },
      cognitive_load: {
        description: 'Intrinsic (ICL) and Extraneous (ECL) load metrics',
        optional: ['project'],
        example: { action: 'cognitive_load', project: 'my-app' },
        aliases: ['load', 'get_cognitive_load'],
      },
      critical_path: {
        description: 'Longest chain of unfinished tasks to milestone',
        optional: ['milestone_id', 'project'],
        example: { action: 'critical_path', project: 'my-app' },
        aliases: ['longest_path', 'bottlenecks'],
      },
      context_snapshot: {
        description: 'Single-call overview for agent alignment',
        optional: ['project'],
        example: { action: 'context_snapshot', project: 'my-app' },
        aliases: ['snapshot_context', 'align'],
      },
      decision_trail: {
        description: 'Trace decision lineage upstream and downstream',
        required: ['node_id'],
        optional: ['project'],
        example: { action: 'decision_trail', project: 'my-app', node_id: '01KYBJ...' },
        aliases: ['trail', 'decision_lineage'],
      },
      find_related_decisions: {
        description: 'Find decisions referencing an artifact',
        required: ['artifact_id'],
        optional: ['project'],
        example: { action: 'find_related_decisions', project: 'my-app', artifact_id: '01KYBJ...' },
        aliases: ['related_decisions'],
      },
      contradictions: {
        description: 'Audit conflicting decisions and invalid states',
        optional: ['project'],
        example: { action: 'contradictions', project: 'my-app' },
        aliases: ['detect_contradictions', 'conflicts'],
      },
    },
    inferAction: (args) => {
      if (args.days) return 'burndown';
      if (args.window_days) return 'velocity';
      if (args.milestone_id) return 'critical_path';
      if (args.node_id) return 'decision_trail';
      if (args.artifact_id) return 'find_related_decisions';
      if (args.contradictions) return 'contradictions';
      if (args.context) return 'context_snapshot';
      return 'summary';
    },
  },

  get_events: {
    tool: 'get_events',
    description: 'Cryptographic audit ledger and session post-mortems',
    actions: {
      log: {
        description: 'Query append-only event ledger with filters',
        optional: ['session_id', 'since', 'until', 'limit', 'project'],
        example: { action: 'log', project: 'my-app', limit: 20 },
        aliases: ['events', 'get_event_log', 'audit_log'],
      },
      changelog: {
        description: 'Structured graph diff since timestamp or session',
        optional: ['since', 'since_session', 'git_branch', 'project'],
        example: { action: 'changelog', project: 'my-app', since: '2h' },
        aliases: ['what_changed', 'diff', 'changes'],
      },
      post_mortem: {
        description: 'Generate structured markdown post-mortem report for session',
        optional: ['session_id', 'project'],
        example: { action: 'post_mortem', project: 'my-app' },
        aliases: ['report', 'session_report', 'post_mortem_from_session'],
      },
    },
    inferAction: (args) => {
      if (args.since || args.since_session) return 'changelog';
      if (args.post_mortem || args.report) return 'post_mortem';
      return 'log';
    },
  },

  run_diagnostics: {
    tool: 'run_diagnostics',
    description: 'Health reports, validation, compaction, and version info',
    actions: {
      validate: {
        description: 'Graph validation checks for cycles, orphans, dangling edges',
        optional: ['checks', 'project'],
        example: { action: 'validate', project: 'my-app' },
        aliases: ['validate_graph', 'check_graph', 'verify'],
      },
      doctor: {
        description: 'Comprehensive health report for SQLite, schema, and storage',
        optional: ['project'],
        example: { action: 'doctor', project: 'my-app' },
        aliases: ['health', 'check_all'],
      },
      check_refs: {
        description: 'Validate file paths and code symbols',
        optional: ['auto_heal', 'project'],
        example: { action: 'check_refs', project: 'my-app', auto_heal: true },
        aliases: ['validate_memory_references', 'check_files'],
      },
      audit_chain: {
        description: 'Verify cryptographic SHA-256 event hash integrity',
        optional: ['project'],
        example: { action: 'audit_chain', project: 'my-app' },
        aliases: ['verify_audit_chain', 'verify_hashes'],
      },
      compact: {
        description: 'Reclaim SQLite storage space and vacuum',
        optional: ['prune_orphaned_edges', 'project'],
        example: { action: 'compact', project: 'my-app' },
        aliases: ['vacuum', 'optimize', 'clean'],
      },
      archive: {
        description: 'Archive old completed tasks',
        optional: ['older_than_days', 'project'],
        example: { action: 'archive', project: 'my-app', older_than_days: 30 },
        aliases: ['archive_tasks'],
      },
      prune_events: {
        description: 'Permanently prune historical events (requires STATE_MEMORY_ADMIN_MODE=true)',
        optional: ['older_than', 'dry_run', 'preserve_types', 'project'],
        example: { action: 'prune_events', project: 'my-app', older_than: '90d' },
        aliases: ['delete_events'],
      },
      version: {
        description: 'Retrieve server and runtime environment version metadata',
        optional: ['project'],
        example: { action: 'version', project: 'my-app' },
        aliases: ['app_version', 'get_version'],
      },
    },
    inferAction: (args) => {
      if (args.auto_heal) return 'check_refs';
      if (args.checks) return 'validate';
      if (args.older_than_days) return 'archive';
      if (args.older_than) return 'prune_events';
      return 'validate';
    },
  },

  use_blackboard: {
    tool: 'use_blackboard',
    description: 'Multi-agent notice board with topic channels and TTL',
    actions: {
      post: {
        description: 'Post notice to shared topic channel',
        required: ['topic', 'content'],
        optional: ['agent_id', 'agent_role', 'ttl_seconds', 'project'],
        example: { action: 'post', project: 'my-app', topic: 'auth', content: 'Secret updated' },
        aliases: ['write', 'send', 'publish'],
      },
      read: {
        description: 'Read active non-expired blackboard notices',
        optional: ['topic', 'limit', 'project'],
        example: { action: 'read', project: 'my-app', topic: 'auth' },
        aliases: ['get', 'fetch', 'listen'],
      },
    },
    inferAction: (args) => {
      if (args.content) return 'post';
      return 'read';
    },
  },
};

/**
 * Resolve an action for a tool, handling aliases and smart payload inference.
 */
export function resolveAction(
  toolName: string,
  rawAction: any,
  args: Record<string, any> = {}
): { action: string | null; inferred: boolean; errorGuidance?: Record<string, any> } {
  const toolMeta = TOOL_ACTION_REGISTRY[toolName];
  if (!toolMeta) {
    return { action: typeof rawAction === 'string' ? rawAction : null, inferred: false };
  }

  // 1. Direct match on supported actions or aliases
  if (typeof rawAction === 'string' && rawAction.trim() !== '') {
    const normalized = rawAction.toLowerCase().trim();
    if (toolMeta.actions[normalized]) {
      return { action: normalized, inferred: false };
    }

    // 2. Check alias mappings across actions
    for (const [actionKey, actionDoc] of Object.entries(toolMeta.actions)) {
      if (actionDoc.aliases && actionDoc.aliases.includes(normalized)) {
        return { action: actionKey, inferred: true };
      }
    }

    // Explicit action string was invalid -> return guidance
    const guidance = generateToolActionGuidance(toolName, rawAction);
    return { action: null, inferred: false, errorGuidance: guidance };
  }

  // 3. Smart payload inference if action is missing/null/empty
  if (toolMeta.inferAction) {
    const inferred = toolMeta.inferAction(args);
    if (inferred && toolMeta.actions[inferred]) {
      return { action: inferred, inferred: true };
    }
  }

  // 4. Generate structured self-healing guidance
  const guidance = generateToolActionGuidance(toolName, rawAction);
  return { action: null, inferred: false, errorGuidance: guidance };
}

/**
 * Generate a comprehensive self-healing error guidance payload for an agent.
 */
export function generateToolActionGuidance(
  toolName: string,
  attemptedAction?: any
): Record<string, any> {
  const toolMeta = TOOL_ACTION_REGISTRY[toolName];
  if (!toolMeta) {
    return {
      error: `Unknown tool: ${toolName}`,
      supported_tools: Object.keys(TOOL_ACTION_REGISTRY),
      hint: 'Please choose one of the supported consolidated tools above.',
    };
  }

  const supportedActionsSummary: Record<string, any> = {};
  for (const [actionName, actionDoc] of Object.entries(toolMeta.actions)) {
    supportedActionsSummary[actionName] = {
      description: actionDoc.description,
      required: actionDoc.required || [],
      optional: actionDoc.optional || [],
      example: actionDoc.example,
    };
  }

  return {
    isError: true,
    error: attemptedAction
      ? `Invalid action "${attemptedAction}" for tool "${toolName}".`
      : `Missing required parameter "action" for tool "${toolName}".`,
    tool: toolName,
    tool_description: toolMeta.description,
    supported_actions: supportedActionsSummary,
    self_healing_hint: `Call "${toolName}" with one of the supported actions. Example: ${JSON.stringify(
      Object.values(toolMeta.actions)[0]?.example || {}
    )}`,
  };
}
