# 🚀 Migration Guide: v0.10 → v1.0

This guide explains how to migrate client integrations, custom agents, and tool callers from `state-memory-mcp` v0.10 to the consolidated **v1.0 API**.

---

## Overview of Changes

In `v1.0.0`, the tool surface has been consolidated from **82 individual tools** into **13 domain-oriented, action-dispatched tools** (≤ 15 tools).

- **Why?** To maximize AI model decision accuracy, eliminate tool disambiguation overhead, achieve top-tier Glama Server Coherence standards (Score A), and provide a clean, unified interface.
- **Zero Functionality Lost**: 100% of underlying graph features, analysis tools, SDD spec operations, and multimodal synergy capabilities are preserved under action parameters.
- **Removed Non-Functional Stubs**:
  - `subscribe_context_changes` (non-functional stub)
  - `watch_graph_changes` (redundant wrapper; use `get_events(action: "log")`)
  - `traceback_to_node` (redundant; use `manage_nodes(action: "update", status: "in_progress")`)

---

## Backward Compatibility Mode (`STATE_MEMORY_COMPAT=true`)

If you have legacy workflows, existing IDE configurations, or agent scripts that call the old tool names, you can enable backward compatibility mode:

```json
{
  "mcpServers": {
    "state-memory": {
      "command": "npx",
      "args": ["-y", "@putervision/state-memory-mcp@1.0.0"],
      "env": {
        "STATE_MEMORY_COMPAT": "true"
      }
    }
  }
}
```

When enabled:
1. All 78 legacy tool names are registered as alias shims alongside the 13 consolidated tools.
2. Calls to legacy tool names automatically translate arguments and route to the corresponding consolidated handler.
3. A `[DEPRECATED]` warning is emitted to stderr without corrupting MCP JSON-RPC protocol framing.

---

## Complete Legacy Mapping Table

| Old Tool Name (v0.10) | New Tool Name (v1.0) | Action Parameter | Notes |
| :--- | :--- | :--- | :--- |
| `add_node` | `manage_nodes` | `action: "create"` | Pass `type`, `title`, etc. |
| `update_node` | `manage_nodes` | `action: "update"` | Pass `id`, `status`, etc. |
| `get_node` | `manage_nodes` | `action: "get"` | Pass `id` |
| `remove_node` | `manage_nodes` | `action: "remove"` | Pass `id` |
| `list_nodes` | `manage_nodes` | `action: "list"` | Pass `type`, `status`, `limit` |
| `search_nodes` | `manage_nodes` | `action: "search"` | Pass `query`, `algorithm` |
| `batch_create_nodes` | `manage_nodes` | `action: "batch_create"` | Pass `nodes: [...]` |
| `batch_update` | `manage_nodes` | `action: "batch_update"` | Pass `ids: [...]` |
| `add_note` | `manage_nodes` | `action: "add_note"` | Pass `text`, `attach_to` |
| `add_edge` | `manage_edges` | `action: "add"` | Pass `source_id`, `target_id`, `type` |
| `remove_edge` | `manage_edges` | `action: "remove"` | Pass `source_id`, `target_id`, `type` |
| `batch_add_edges` | `manage_edges` | `action: "batch_add"` | Pass `edges: [...]` |
| `link_visual_state` | `manage_edges` | `action: "link_visual"` | Pass `target_id`, `visual_state_id` |
| `start_session` | `manage_sessions` | `action: "start"` | Pass `agent_id` |
| `end_session` | `manage_sessions` | `action: "end"` | Pass `session_id` |
| `list_sessions` | `manage_sessions` | `action: "list"` | Pass `limit`, `active_only` |
| `bootstrap_session` | `manage_sessions` | `action: "bootstrap"` | Single-turn session start |
| `next_tasks` | `manage_tasks` | `action: "next"` | Pass `limit`, `include_context` |
| `complete_task` | `manage_tasks` | `action: "complete"` | Pass `task_id`, `artifact_title` |
| `find_blocked_tasks` | `manage_tasks` | `action: "find_blocked"` | Pass `decision_id` |
| `get_stale_nodes` | `manage_tasks` | `action: "find_stale"` | Pass `older_than` |
| `find_blockers` | `manage_tasks` | `action: "find_blockers"` | Pass `node_id` |
| `find_similar_blockers` | `manage_tasks` | `action: "find_similar_blockers"` | Pass `query` |
| `auto_prune_stale_tasks` | `manage_tasks` | `action: "auto_prune"` | Pass `older_than` |
| `save_snapshot` | `manage_snapshots` | `action: "save"` | Pass `session_id`, `force` |
| `list_snapshots` | `manage_snapshots` | `action: "list"` | Pass `limit` |
| `diff_snapshots` | `manage_snapshots` | `action: "diff"` | Pass `snapshot_id_a`, `snapshot_id_b` |
| `get_state_at_timestamp` | `manage_snapshots` | `action: "get_state"` | Pass `timestamp` |
| `revert_to_timestamp` | `manage_snapshots` | `action: "revert"` | Pass `timestamp` |
| `undo_last` | `manage_snapshots` | `action: "undo"` | Pass `node_id` |
| `get_node_history` | `manage_snapshots` | `action: "get_history"` | Pass `node_id` |
| `scaffold_spec` | `manage_specs` | `action: "scaffold"` | Pass `title` |
| `ingest_spec` | `manage_specs` | `action: "ingest"` | Pass `file_path`, `format` |
| `export_spec` | `manage_specs` | `action: "export"` | Pass `spec_id`, `format` |
| `get_spec_compliance` | `manage_specs` | `action: "compliance"` | Returns coverage matrix |
| `verify_requirement` | `manage_specs` | `action: "verify"` | Pass `criterion_id`, `status` |
| `plan_and_decompose_feature` | `manage_specs` | `action: "decompose_feature"` | Pass `title`, `subtasks` |
| `scaffold_template` | `manage_specs` | `action: "template"` | Pass `template: "fdd" \| "rfc"` |
| `backup_project_db` | `manage_database` | `action: "backup"` | Pass `outputPath` |
| `restore_project_db` | `manage_database` | `action: "restore"` | Pass `backupPath`, `force` |
| `audit_project_db` | `manage_database` | `action: "audit"` | Foreign keys and integrity |
| `merge_project_db` | `manage_database` | `action: "merge"` | Pass `sourcePath` |
| `vcs_branch_sync` | `manage_database` | `action: "branch_diff"` | Pass `target_branch` |
| `vcs_merge_resolution` | `manage_database` | `action: "branch_merge"` | Pass `source_branch`, `strategy` |
| `export_graph` | `manage_data` | `action: "export_graph"` | Pass `format: "json" \| "dot"` |
| `export_issues` | `manage_data` | `action: "export_issues"` | Pass `format: "github" \| "jira"` |
| `export_trajectories` | `manage_data` | `action: "export_trajectories"` | Pass `limit`, `session_id` |
| `export_joint_trajectories` | `manage_data` | `action: "export_joint_trajectories"` | Pass `limit`, `session_id` |
| `get_synergy_metrics` | `manage_data` | `action: "export_synergy_metrics"` | Returns dual-memory metrics |
| `import_graph` | `manage_data` | `action: "import_graph"` | Pass `nodes`, `edges` |
| `import_issues` | `manage_data` | `action: "import_issues"` | Pass `issues: [...]` |
| `get_subgraph` | `query_graph` | `action: "subgraph"` | Pass `root_id`, `depth` |
| `trace_dependencies` | `query_graph` | `action: "trace"` | Pass `node_id`, `direction` |
| `impact_analysis` | `query_graph` | `action: "trace"` | With `direction: "downstream"` |
| `query_graph` | `query_graph` | `action: "raw"` | Pass `sql`, `params` |
| `natural_language_query` | `query_graph` | `action: "natural_language"` | Pass `query` |
| `get_project_summary` | `get_analytics` | `action: "summary"` | Project overview |
| `velocity_analytics` | `get_analytics` | `action: "velocity"` | Pass `window_days` |
| `burndown_chart` | `get_analytics` | `action: "burndown"` | Pass `days` |
| `value_metrics` | `get_analytics` | `action: "value_metrics"` | Token savings and ROI |
| `get_cognitive_load` | `get_analytics` | `action: "cognitive_load"` | Intrinsic & extraneous load |
| `critical_path` | `get_analytics` | `action: "critical_path"` | Pass `milestone_id` |
| `get_context_snapshot` | `get_analytics` | `action: "context_snapshot"` | Consolidated overview |
| `decision_trail` | `get_analytics` | `action: "decision_trail"` | Pass `node_id` |
| `find_related_decisions` | `get_analytics` | `action: "find_related_decisions"` | Pass `artifact_id` |
| `detect_contradictions` | `get_analytics` | `action: "contradictions"` | Conflicting decisions audit |
| `get_event_log` | `get_events` | `action: "log"` | Pass `session_id`, `since` |
| `what_changed` | `get_events` | `action: "changelog"` | Pass `since` or `since_session` |
| `post_mortem_from_session` | `get_events` | `action: "post_mortem"` | Pass `session_id` |
| `validate_graph` | `run_diagnostics` | `action: "validate"` | Graph integrity checks |
| `doctor_report` | `run_diagnostics` | `action: "doctor"` | SQLite and storage health |
| `validate_memory_references` | `run_diagnostics` | `action: "check_refs"` | File and AST validation |
| `verify_audit_chain` | `run_diagnostics` | `action: "audit_chain"` | SHA-256 event hash integrity |
| `compact_graph` | `run_diagnostics` | `action: "compact"` | Reclaims storage space |
| `archive_completed_nodes` | `run_diagnostics` | `action: "archive"` | Pass `older_than_days` |
| `prune_events` | `run_diagnostics` | `action: "prune_events"` | Requires admin mode |
| `app_version` | `run_diagnostics` | `action: "version"` | Retrieves version metadata |
| `post_blackboard` | `use_blackboard` | `action: "post"` | Pass `topic`, `content` |
| `read_blackboard` | `use_blackboard` | `action: "read"` | Pass `topic` |

---

## Example Migration Walkthrough

### Before (v0.10):
```typescript
// Create task
await client.callTool({
  name: "add_node",
  arguments: { project: "my-app", type: "task", title: "Setup Database" }
});

// Mark complete
await client.callTool({
  name: "complete_task",
  arguments: { project: "my-app", task_id: "01M..." }
});
```

### After (v1.0):
```typescript
// Create task
await client.callTool({
  name: "manage_nodes",
  arguments: { action: "create", project: "my-app", type: "task", title: "Setup Database" }
});

// Mark complete
await client.callTool({
  name: "manage_tasks",
  arguments: { action: "complete", project: "my-app", task_id: "01M..." }
});
```
