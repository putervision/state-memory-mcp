import { McpError, ErrorCode } from '../transport/native-mcp.js';
import { logger } from '../utils/logger.js';

export interface LegacyMapping {
  tool: string;
  action: string;
  argRenames?: Record<string, string>;
  transform?: (args: Record<string, any>) => Record<string, any>;
}

export const REMOVED_TOOLS: Record<string, string> = {
  subscribe_context_changes: 'Removed non-functional stub.',
  watch_graph_changes: 'Removed wrapper. Use get_events(action: "log") instead.',
  traceback_to_node:
    'Removed redundant tool. Use manage_nodes(action: "update", status: "in_progress") instead.',
};

export const LEGACY_TOOL_MAP: Record<string, LegacyMapping> = {
  // manage_nodes
  add_node: { tool: 'manage_nodes', action: 'create' },
  update_node: { tool: 'manage_nodes', action: 'update' },
  get_node: { tool: 'manage_nodes', action: 'get' },
  remove_node: { tool: 'manage_nodes', action: 'remove' },
  list_nodes: { tool: 'manage_nodes', action: 'list' },
  search_nodes: { tool: 'manage_nodes', action: 'search' },
  batch_create_nodes: { tool: 'manage_nodes', action: 'batch_create' },
  batch_update: { tool: 'manage_nodes', action: 'batch_update' },
  add_note: { tool: 'manage_nodes', action: 'add_note' },

  // manage_edges
  add_edge: { tool: 'manage_edges', action: 'add' },
  remove_edge: { tool: 'manage_edges', action: 'remove' },
  batch_add_edges: { tool: 'manage_edges', action: 'batch_add' },
  link_visual_state: { tool: 'manage_edges', action: 'link_visual' },

  // manage_sessions
  start_session: { tool: 'manage_sessions', action: 'start' },
  end_session: { tool: 'manage_sessions', action: 'end' },
  list_sessions: { tool: 'manage_sessions', action: 'list' },
  bootstrap_session: { tool: 'manage_sessions', action: 'bootstrap' },

  // manage_tasks
  next_tasks: { tool: 'manage_tasks', action: 'next' },
  complete_task: { tool: 'manage_tasks', action: 'complete' },
  find_blocked_tasks: { tool: 'manage_tasks', action: 'find_blocked' },
  get_stale_nodes: { tool: 'manage_tasks', action: 'find_stale' },
  find_blockers: { tool: 'manage_tasks', action: 'find_blockers' },
  find_similar_blockers: { tool: 'manage_tasks', action: 'find_similar_blockers' },
  auto_prune_stale_tasks: { tool: 'manage_tasks', action: 'auto_prune' },

  // manage_snapshots
  save_snapshot: { tool: 'manage_snapshots', action: 'save' },
  list_snapshots: { tool: 'manage_snapshots', action: 'list' },
  diff_snapshots: { tool: 'manage_snapshots', action: 'diff' },
  get_state_at_timestamp: { tool: 'manage_snapshots', action: 'get_state' },
  revert_to_timestamp: { tool: 'manage_snapshots', action: 'revert' },
  undo_last: { tool: 'manage_snapshots', action: 'undo' },
  get_node_history: { tool: 'manage_snapshots', action: 'get_history' },

  // manage_specs
  scaffold_spec: { tool: 'manage_specs', action: 'scaffold' },
  ingest_spec: { tool: 'manage_specs', action: 'ingest' },
  export_spec: { tool: 'manage_specs', action: 'export' },
  get_spec_compliance: { tool: 'manage_specs', action: 'compliance' },
  verify_requirement: { tool: 'manage_specs', action: 'verify' },
  plan_and_decompose_feature: { tool: 'manage_specs', action: 'decompose_feature' },
  scaffold_template: { tool: 'manage_specs', action: 'template' },

  // manage_database
  backup_project_db: { tool: 'manage_database', action: 'backup' },
  restore_project_db: { tool: 'manage_database', action: 'restore' },
  audit_project_db: { tool: 'manage_database', action: 'audit' },
  merge_project_db: { tool: 'manage_database', action: 'merge' },
  vcs_branch_sync: { tool: 'manage_database', action: 'branch_diff' },
  vcs_merge_resolution: { tool: 'manage_database', action: 'branch_merge' },

  // manage_data
  export_graph: { tool: 'manage_data', action: 'export_graph' },
  export_issues: { tool: 'manage_data', action: 'export_issues' },
  export_trajectories: { tool: 'manage_data', action: 'export_trajectories' },
  export_joint_trajectories: { tool: 'manage_data', action: 'export_joint_trajectories' },
  get_synergy_metrics: { tool: 'manage_data', action: 'export_synergy_metrics' },
  import_graph: { tool: 'manage_data', action: 'import_graph' },
  import_issues: { tool: 'manage_data', action: 'import_issues' },

  // query_graph
  get_subgraph: { tool: 'query_graph', action: 'subgraph' },
  trace_dependencies: { tool: 'query_graph', action: 'trace' },
  impact_analysis: {
    tool: 'query_graph',
    action: 'trace',
    transform: (args) => ({ ...args, direction: 'downstream' }),
  },
  natural_language_query: { tool: 'query_graph', action: 'natural_language' },

  // get_analytics
  get_project_summary: { tool: 'get_analytics', action: 'summary' },
  velocity_analytics: { tool: 'get_analytics', action: 'velocity' },
  burndown_chart: { tool: 'get_analytics', action: 'burndown' },
  value_metrics: { tool: 'get_analytics', action: 'value_metrics' },
  get_cognitive_load: { tool: 'get_analytics', action: 'cognitive_load' },
  critical_path: { tool: 'get_analytics', action: 'critical_path' },
  get_context_snapshot: { tool: 'get_analytics', action: 'context_snapshot' },
  decision_trail: { tool: 'get_analytics', action: 'decision_trail' },
  find_related_decisions: { tool: 'get_analytics', action: 'find_related_decisions' },
  detect_contradictions: { tool: 'get_analytics', action: 'contradictions' },

  // get_events
  get_event_log: { tool: 'get_events', action: 'log' },
  what_changed: { tool: 'get_events', action: 'changelog' },
  post_mortem_from_session: { tool: 'get_events', action: 'post_mortem' },

  // run_diagnostics
  validate_graph: { tool: 'run_diagnostics', action: 'validate' },
  doctor_report: { tool: 'run_diagnostics', action: 'doctor' },
  validate_memory_references: { tool: 'run_diagnostics', action: 'check_refs' },
  verify_audit_chain: { tool: 'run_diagnostics', action: 'audit_chain' },
  compact_graph: { tool: 'run_diagnostics', action: 'compact' },
  archive_completed_nodes: { tool: 'run_diagnostics', action: 'archive' },
  prune_events: { tool: 'run_diagnostics', action: 'prune_events' },
  app_version: { tool: 'run_diagnostics', action: 'version' },

  // use_blackboard
  post_blackboard: { tool: 'use_blackboard', action: 'post' },
  read_blackboard: { tool: 'use_blackboard', action: 'read' },
};

export function translateLegacyCall(
  legacyToolName: string,
  args: Record<string, any>
): { tool: string; action: string; transformedArgs: Record<string, any> } {
  if (REMOVED_TOOLS[legacyToolName]) {
    throw new McpError(ErrorCode.MethodNotFound, REMOVED_TOOLS[legacyToolName]);
  }

  const mapping = LEGACY_TOOL_MAP[legacyToolName];
  if (!mapping) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown legacy tool: ${legacyToolName}`);
  }

  logger.warn(
    `[DEPRECATED] Tool "${legacyToolName}" is deprecated in state-memory-mcp v1.0. Please use "${mapping.tool}" with action: "${mapping.action}".`
  );

  let transformedArgs: Record<string, any> = { ...args, action: mapping.action };
  if (mapping.argRenames) {
    for (const [oldKey, newKey] of Object.entries(mapping.argRenames)) {
      if (oldKey in transformedArgs) {
        transformedArgs[newKey] = transformedArgs[oldKey];
        delete transformedArgs[oldKey];
      }
    }
  }
  if (mapping.transform) {
    transformedArgs = mapping.transform(transformedArgs);
  }

  return {
    tool: mapping.tool,
    action: mapping.action,
    transformedArgs,
  };
}
