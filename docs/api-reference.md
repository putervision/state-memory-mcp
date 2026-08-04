# 📘 @putervision/state-memory-mcp Formal API Reference & Leveraged Usage Guide (v0.9.31)

This document provides formal API specifications, parameter schemas, return shapes, JSON payloads, and practical leverage descriptions for all 82 Model Context Protocol (MCP) tools provided by `@putervision/state-memory-mcp`.

---

## 1. Session & Project Administration

### `start_session`
- **Overview**: Initiates a new isolated session ledger for tracking agent actions.
- **How to Leverage**: Call this tool at the very beginning of a complex prompt or multi-agent run. It isolates mutations so that if an agent run fails or needs auditing, all node and edge creations/updates can be filtered, tracked, or rolled back by `session_id`.
- **Request Payload**:
```json
{
  "project": "my-app",
  "agent_id": "cursor-agent-01",
  "metadata": { "workflow": "auth-refactor", "branch": "feature/oauth" }
}
```
- **Response Payload**:
```json
{
  "session_id": "sess_01KYBJ0RWJ8V",
  "project": "my-app",
  "status": "started",
  "timestamp": "2026-07-25T03:54:00.000Z"
}
```

### `end_session`
- **Overview**: Closes an active agent session ledger.
- **How to Leverage**: Call upon finishing a task or when delegating to another subagent. It records total execution duration and marks the session lifecycle as complete in the audit log.
- **Request Payload**:
```json
{
  "session_id": "sess_01KYBJ0RWJ8V",
  "project": "my-app"
}
```

### `get_project_summary`
- **Overview**: Returns high-level project metrics, task counts, progress %, and open blockers.
- **How to Leverage**: Leverage as the primary "first turn" context prompt tool. Instead of reading hundreds of files to figure out project status, calling `get_project_summary` instantly delivers completed vs pending tasks, current velocity, and blocking issues in under 5ms.
- **Request Payload**:
```json
{ "project": "my-app" }
```
- **Response Payload**:
```json
{
  "project": "my-app",
  "total_nodes": 42,
  "active_tasks": 5,
  "completed_tasks": 31,
  "progress_pct": 73.8,
  "blockers_count": 1,
  "formatted_summary": "Project my-app: 31/42 tasks completed (73.8%). 1 active blocker."
}
```

---

## 2. Task & Node Mutations

### `add_node`
- **Overview**: Creates a new node in the state graph.
- **How to Leverage**: Leverage when planning a feature or recording an architectural decision. Create `task` nodes for actionable code work, `decision` nodes for technical choices (e.g., choosing a database), `blocker` nodes when stuck, and `artifact` nodes for generated files.
- **Request Payload**:
```json
{
  "project": "my-app",
  "type": "decision",
  "title": "Use Argon2id for password hashing",
  "description": "Selected Argon2id over bcrypt for memory-hard key derivation compliance.",
  "status": "done",
  "tags": ["security", "auth"]
}
```

### `update_node`
- **Overview**: Updates node properties or status.
- **How to Leverage**: Use to transition task statuses (`pending` -> `in_progress` -> `done`). When an agent finishes a task, calling `update_node(status: "done")` automatically unblocks downstream dependent tasks.
- **Request Payload**:
```json
{
  "project": "my-app",
  "id": "task_auth_01",
  "status": "done"
}
```

### `add_edge`
- **Overview**: Links two nodes with a directional relationship.
- **How to Leverage**: Build explicit dependency subgraphs (e.g. `task_B depends_on task_A` or `blocker_X blocks task_C`). The server automatically rejects circular loops, maintaining a strict Directed Acyclic Graph (DAG).
- **Request Payload**:
```json
{
  "project": "my-app",
  "source_id": "blocker_db_01",
  "target_id": "task_auth_01",
  "type": "blocks"
}
```

---

## 3. Graph Traversal & Analysis

### `next_tasks`
- **Overview**: Queries top prioritized, unblocked, runnable tasks.
- **How to Leverage**: Leverage in autonomous loop execution scripts. Instead of asking the user "what should I do next?", the agent calls `next_tasks` to retrieve the exact set of tasks whose dependencies are 100% satisfied.
- **Request Payload**:
```json
{
  "project": "my-app",
  "limit": 3,
  "include_context": true
}
```

### `get_cognitive_load`
- **Overview**: Calculates Intrinsic ($ICL$) and Extraneous ($ECL$) cognitive load metrics.
- **How to Leverage**: Leverage to audit prompt context bloat. Drives Extraneous Cognitive Load ($ECL$) to near zero by offloading unneeded task definitions into local SQLite.
- **Request Payload**:
```json
{ "project": "my-app" }
```
- **Response Payload**:
```json
{
  "project": "my-app",
  "metrics": {
    "intrinsic_cognitive_load_ICL": 14.5,
    "extraneous_cognitive_load_ECL": 2.0,
    "total_cognitive_load_CL": 16.5
  },
  "summary": "Active cognitive load: ICL = 14.5, ECL = 2.0. Extraneous load offloaded to SQLite."
}
```

### `traceback_to_node`
- **Overview**: Resets task execution state back to a prior validated node when test/verification fails.
- **How to Leverage**: When a test or build fails unexpectedly, call `traceback_to_node(target_node_id: "task_schema_01")` to cleanly reset active task execution back to a known working state, avoiding hallucinated recovery loops inside a corrupted prompt.
- **Request Payload**:
```json
{
  "project": "my-app",
  "target_node_id": "task_schema_01",
  "reason": "Integration test failed on migration script."
}
```

---

## 4. Event Sourcing & Cryptographic Auditing

### `verify_audit_chain`
- **Overview**: Verifies SHA-256 event audit hash chain integrity ($H_n = \text{SHA-256}(H_{n-1} \parallel \text{event}_n)$).
- **How to Leverage**: Leverage in CI/CD pre-commit hooks or compliance audits (e.g. EU AI Act). Ensures no human or malicious subagent manually edited or deleted historical event logs.
- **Request Payload**:
```json
{ "project": "my-app" }
```
- **Response Payload**:
```json
{
  "valid": true,
  "total_events": 148,
  "message": "Cryptographic audit chain verified: 148 hashed events intact."
}
```

### `subscribe_context_changes`
- **Overview**: Registers CA-MCP Shared Context Store reactor triggers.
- **How to Leverage**: Enables $N_{\text{LLM}} = 2$ multi-agent orchestration. Specialized worker agents subscribe to state changes and react asynchronously without invoking central LLM turns.
- **Request Payload**:
```json
{
  "project": "my-app",
  "since_event_id": 120
}
```

---

## 5. RAG & Automation Tools

### `find_similar_blockers`
- **Overview**: Semantic TF-IDF search over historical observations and resolved blockers to discover past resolution patterns.
- **How to Leverage**: When encountering a tricky error or blocker, call `find_similar_blockers(query: "database pool timeout")` to retrieve solved blockers and past technical notes with similar resolution patterns.
- **Request Payload**:
```json
{
  "project": "my-app",
  "query": "database connection pool timeout under load",
  "limit": 5
}
```

### `auto_prune_stale_tasks`
- **Overview**: Automatically transitions inactive `in_progress` tasks idle beyond a specified duration threshold.
- **How to Leverage**: Call `auto_prune_stale_tasks(older_than: "7d", target_status: "cancelled")` to keep task queues clean and prevent stale tasks from cluttering context.
- **Request Payload**:
```json
{
  "project": "my-app",
  "older_than": "7d",
  "target_status": "cancelled"
}
```

---

## 6. Complete 82 MCP Tools Master Index

| Tool Name | Category | Primary Inputs | Description |
| :--- | :--- | :--- | :--- |
| `start_session` | Session & Admin | `project`, `agent_id`, `metadata` | Starts a new tracking session ledger. |
| `end_session` | Session & Admin | `session_id`, `project` | Concludes an active tracking session. |
| `list_sessions` | Session & Admin | `project`, `limit` | Lists active and historical tracking sessions. |
| `bootstrap_session` | Session & Admin | `project`, `agent_id`, `task_limit` | Single-turn session start, context snapshot & next tasks. |
| `get_project_summary` | Session & Admin | `project` | High-level metrics, progress %, and open blockers. |
| `get_context_snapshot` | Session & Admin | `project` | Detailed graph snapshot for session context hydration. |
| `app_version` | Session & Admin | `project` | Returns server version, package identity, and runtime environment. |
| `add_node` | Node Operations | `type`, `title`, `project`, `status` | Creates a new node in the state graph. |
| `update_node` | Node Operations | `id`, `project`, `title`, `status` | Modifies properties or status of an existing node. |
| `get_node` | Node Operations | `id`, `project`, `include_edges` | Fetches node details and all connected edges. |
| `remove_node` | Node Operations | `id`, `project` | Cascades node deletion and connected edges. |
| `complete_task` | Node Operations | `task_id`, `artifact_title`, `project` | Marks task done and produces linked artifact node. |
| `batch_create_nodes` | Node Operations | `nodes`, `project` | Atomically creates multiple nodes in a transaction. |
| `batch_update` | Node Operations | `ids`, `status`, `project` | Atomically updates statuses for multiple nodes. |
| `add_edge` | Edge Operations | `source_id`, `target_id`, `type` | Links two nodes with typed relationship (DAG enforced). |
| `remove_edge` | Edge Operations | `source_id`, `target_id`, `type` | Deletes a specific relationship edge. |
| `batch_add_edges` | Edge Operations | `edges`, `project` | Atomically creates multiple relationship edges. |
| `list_nodes` | Search & Querying | `type`, `status`, `tags`, `fields` | Lists nodes matching filters with selective field projection. |
| `search_nodes` | Search & Querying | `query`, `project`, `fields` | FTS5 full-text or TF-IDF search across title/metadata. |
| `get_subgraph` | Search & Querying | `node_ids`, `depth`, `project` | Extracts localized subgraph neighborhood around nodes. |
| `query_graph` | Search & Querying | `sql`, `params`, `project` | Executes safe read-only SELECT queries with 7-layer defense. |
| `natural_language_query` | Search & Querying | `query`, `project` | Natural language text-to-graph query resolution. |
| `find_similar_blockers` | Search & Querying | `query`, `project`, `limit` | TF-IDF semantic search over solved blockers/notes. |
| `trace_dependencies` | Dependency Analysis | `node_id`, `direction`, `max_depth` | Traces upstream/downstream dependency trees. |
| `find_blockers` | Dependency Analysis | `project`, `node_id` | Identifies active blockers preventing task progress. |
| `find_blocked_tasks` | Dependency Analysis | `decision_id`, `project` | Finds tasks blocked by an unmade or active decision. |
| `find_related_decisions` | Dependency Analysis | `artifact_id`, `project` | Traces decisions leading to a specific artifact. |
| `auto_prune_stale_tasks` | Dependency Analysis | `older_than`, `target_status` | Transitions idle in-progress tasks automatically. |
| `decision_trail` | Analytics & Insights | `node_id`, `project` | Reconstructs historical decision chain leading to a node. |
| `critical_path` | Analytics & Insights | `milestone_id`, `project` | Computes longest path of dependent tasks to milestone. |
| `impact_analysis` | Analytics & Insights | `node_id`, `project` | Evaluates blast radius of modifying a target node. |
| `detect_contradictions` | Analytics & Insights | `project` | Identifies conflicting decisions or contradicting edges. |
| `value_metrics` | Analytics & Insights | `project` | Calculates completed value & milestone progress metrics. |
| `velocity_analytics` | Analytics & Insights | `project`, `window_days` | Time-series velocity, burn-up, and completion rates. |
| `next_tasks` | Queue Management | `project`, `limit` | Returns top prioritized, unblocked, runnable tasks. |
| `what_changed` | Queue Management | `project`, `since`, `session_id` | Delta report of created/updated nodes since timestamp. |
| `get_stale_nodes` | Queue Management | `project`, `inactive_days` | Identifies nodes untouched longer than specified threshold. |
| `ingest_spec` | SDD Spec Engine | `file_path`, `format`, `project` | Parses Markdown/Gherkin spec files into spec/req nodes. |
| `export_spec` | SDD Spec Engine | `spec_id`, `format`, `project` | Exports graph spec node structure back to Markdown text. |
| `get_spec_compliance` | SDD Spec Engine | `project` | Computes specification requirement verification ratio. |
| `scaffold_spec` | SDD Spec Engine | `title`, `project` | Scaffolds standard software design spec template. |
| `verify_requirement` | SDD Spec Engine | `criterion_id`, `status` | Updates requirement acceptance criterion status. |
| `link_visual_state` | Visual Synergy | `target_id`, `visual_state_id` | Connects UI task to visual state layout screenshot ID. |
| `export_joint_trajectories` | Visual Synergy | `project`, `session_id` | Exports interleaved state + visual transition logs. |
| `get_synergy_metrics` | Visual Synergy | `project` | Dual-memory UI verification health metrics. |
| `post_blackboard` | Blackboard Store | `topic`, `content`, `author` | Multi-agent optimistic CAS blackboard post. |
| `read_blackboard` | Blackboard Store | `topic`, `project` | Reads multi-agent blackboard topic content. |
| `get_state_at_timestamp` | Time Travel | `timestamp`, `project` | Reconstructs full graph state at historical timestamp. |
| `revert_to_timestamp` | Time Travel | `timestamp`, `project` | Reverts project graph state to historical checkpoint. |
| `get_node_history` | Time Travel | `node_id`, `project`, `limit` | Chronological update audit trail for a specific node. |
| `export_issues` | VCS & Issue Sync | `project`, `file_path` | Exports graph tasks to GitHub/GitLab issue format. |
| `import_issues` | VCS & Issue Sync | `issues`, `project` | Bulk imports external issue tracker issues into state graph. |
| `vcs_branch_sync` | VCS & Issue Sync | `project`, `target_branch` | Synchronizes nodes across Git workspace branches. |
| `vcs_merge_resolution` | VCS & Issue Sync | `project`, `source_branch` | Resolves node merge conflicts between Git branches. |
| `compact_graph` | Maintenance | `project` | Reclaims SQLite disk space and prunes orphan edges. |
| `archive_completed_nodes` | Maintenance | `project`, `older_than_days` | Archives completed tasks older than threshold. |
| `backup_project_db` | DB Admin | `project`, `output_path` | Online SQLite database backup with SHA-256 hash. |
| `restore_project_db` | DB Admin | `project`, `backup_path` | Restores database from backup with auto-pre-backup. |
| `audit_project_db` | DB Admin | `project` | Deep PRAGMA integrity check and foreign key check. |
| `merge_project_db` | DB Admin | `source_db_path`, `project` | Merges external SQLite state database into current DB. |
| `verify_audit_chain` | DB Admin | `project` | Verifies SHA-256 event audit hash chain integrity. |
| `validate_graph` | DB Admin | `project` | Full graph validation (cycles, orphans, unverified UI). |
| `get_event_log` | Event Sourcing | `project`, `limit` | Fetches chronological event stream log. |
| `export_trajectories` | Event Sourcing | `project`, `session_id` | Exports agent execution trajectories for model training. |
| `subscribe_context_changes` | Event Sourcing | `project`, `since_event_id` | CA-MCP shared context store reactor subscription. |
| `undo_last` | Event Sourcing | `project`, `node_id` | Reverts last recorded mutation for a node. |
| `traceback_to_node` | QoL & Helper | `target_node_id`, `reason` | Resets task execution state back to prior validated node. |
| `get_cognitive_load` | QoL & Helper | `project` | Intrinsic (ICL) and Extraneous (ECL) cognitive load metrics. |
| `validate_memory_references` | QoL & Helper | `project` | Auto-heals broken file path references in nodes. |
| `burndown_chart` | QoL & Helper | `milestone_id`, `project` | Time-series burndown metrics data for milestones. |
| `doctor_report` | QoL & Helper | `project` | System health, DB disk usage, and performance report. |
| `watch_graph_changes` | QoL & Helper | `project` | Monitors graph database file for real-time mutations. |
| `plan_and_decompose_feature` | QoL & Helper | `title`, `subtasks` | Atomic compound feature decomposition into task tree. |
| `post_mortem_from_session` | QoL & Helper | `session_id`, `project` | Generates post-mortem analysis from session events. |
| `scaffold_template` | QoL & Helper | `template`, `name` | Scaffolds FDD feature or RFC architectural templates. |
| `prune_events` | QoL & Helper | `older_than`, `admin_key` | Administrative pruning of old events (requires admin key). |
| `export_graph` | Export Tools | `project`, `format` | Exports graph to JSON, Mermaid, Graphviz, or 3D HTML. |
| `save_snapshot` | Snapshot Engine | `project`, `name` | Takes lightweight point-in-time graph snapshot. |
| `list_snapshots` | Snapshot Engine | `project` | Lists available point-in-time graph snapshots. |
| `diff_snapshots` | Snapshot Engine | `snapshot_id_a`, `snapshot_id_b` | Computes diff comparison between two graph snapshots. |
| `find_blockers` | Dependency Analysis | `project` | Identifies active blockers preventing progress. |
| `get_spec_compliance` | SDD Spec Engine | `project` | Specification requirement verification ratio. |

