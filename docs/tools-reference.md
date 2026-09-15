# 🧰 State-Memory-MCP Tool Reference (v1.2.1 — 13 Consolidated Tools)

`@putervision/state-memory-mcp` exposes **13 domain-oriented MCP tools** (≤ 15 tools) that use action parameters to provide complete graph lifecycle management, dependency analysis, Spec-Driven Development, and multimodal synergy.

---

## Tool Directory Index

| # | Tool Name | Description | Key Actions |
|---|---|---|---|
| 1 | **[`manage_nodes`](#1-manage_nodes)** | Graph node CRUD, search, and batch mutations | `create`, `update`, `get`, `remove`, `list`, `search`, `batch_create`, `batch_update`, `add_note` |
| 2 | **[`manage_edges`](#2-manage_edges)** | Semantic graph edges and visual state linking | `add`, `remove`, `batch_add`, `link_visual` |
| 3 | **[`manage_sessions`](#3-manage_sessions)** | Agent session lifecycle and context bootstrapping | `start`, `end`, `list`, `bootstrap` |
| 4 | **[`manage_tasks`](#4-manage_tasks)** | Task scheduling, blockers, and stale pruning | `next`, `complete`, `find_blocked`, `find_stale`, `find_blockers`, `find_similar_blockers`, `auto_prune` |
| 5 | **[`manage_snapshots`](#5-manage_snapshots)** | Checkpoints, history, and time-travel rollback | `save`, `list`, `diff`, `get_state`, `revert`, `undo`, `get_history` |
| 6 | **[`manage_specs`](#6-manage_specs)** | Spec-Driven Development (SDD) & template scaffolding | `scaffold`, `ingest`, `export`, `compliance`, `verify`, `decompose_feature`, `template` |
| 7 | **[`manage_database`](#7-manage_database)** | Physical SQLite maintenance, backups, and Git VCS sync | `backup`, `restore`, `audit`, `merge`, `branch_diff`, `branch_merge` |
| 8 | **[`manage_data`](#8-manage_data)** | Bulk export & import of graphs, issues, and trajectories | `export_graph`, `export_issues`, `export_trajectories`, `export_joint_trajectories`, `export_synergy_metrics`, `import_graph`, `import_issues`, `import_spec` |
| 9 | **[`query_graph`](#9-query_graph)** | Graph traversal, dependency tracing, and queries | `subgraph`, `trace`, `raw`, `natural_language` |
| 10 | **[`get_analytics`](#10-get_analytics)** | Velocity, burndown, cognitive load, and decision trails | `summary`, `velocity`, `burndown`, `value_metrics`, `cognitive_load`, `critical_path`, `context_snapshot`, `decision_trail`, `find_related_decisions`, `contradictions` |
| 11 | **[`get_events`](#11-get_events)** | Cryptographic audit ledger and session post-mortems | `log`, `changelog`, `post_mortem` |
| 12 | **[`run_diagnostics`](#12-run_diagnostics)** | Health reports, validation, compaction, and version info | `validate`, `doctor`, `check_refs`, `audit_chain`, `compact`, `archive`, `prune_events`, `version` |
| 13 | **[`use_blackboard`](#13-use_blackboard)** | Asynchronous multi-agent notice board | `post`, `read` |

---

## Detailed Tool Specifications

### 1. `manage_nodes`
Manage workflow graph nodes.
- **Actions**:
  - `create`: Add a node (`type`, `title`, `status?`, `metadata?`, `tags?`).
  - `update`: Update node properties (`id`, `title?`, `status?`, `metadata?`, `tags?`, `expected_version?`).
  - `get`: Fetch single node with optional inbound/outbound edges (`id`, `include_edges?`).
  - `remove`: Delete node and its connected edges (`id`).
  - `list`: Filter nodes (`type?`, `status?`, `git_branch?`, `limit?`, `compact?`).
  - `search`: Search nodes using full-text or vector TF-IDF (`query`, `algorithm?`, `type?`, `status?`).
  - `batch_create`: Atomic insertion of multiple node objects (`nodes: [...]`).
  - `batch_update`: Atomic update of multiple node IDs (`ids: [...]`, `status?`, `metadata?`, `tags?`).
  - `add_note`: Log quick observation node and optionally attach to target node (`text`, `attach_to?`, `tags?`).

---

### 2. `manage_edges`
Manage typed relationships between graph nodes.
- **Actions**:
  - `add`: Create edge relationship (`source_id`, `target_id`, `type`, `properties?`).
  - `remove`: Delete specific edge relationship (`source_id`, `target_id`, `type`).
  - `batch_add`: Atomic creation of multiple edge relationships (`edges: [...]`).
  - `link_visual`: Link task or artifact to visual memory state ID (`target_id`, `visual_state_id`, `relationship?`, `visual_description?`, `source_url?`).

---

### 3. `manage_sessions`
Manage agent tracking sessions.
- **Actions**:
  - `start`: Start session tracking (`agent_id`, `metadata?`).
  - `end`: Conclude tracking session (`session_id?`, `agent_id?`).
  - `list`: List sessions (`limit?`, `active_only?`).
  - `bootstrap`: Single-turn session start with context snapshot and prioritized tasks (`agent_id?`, `task_limit?`).

---

### 4. `manage_tasks`
Task prioritization, execution, and blocker management.
- **Actions**:
  - `next`: Get prioritized runnable tasks (`limit?`, `include_context?`, `git_branch?`).
  - `complete`: Mark task done and create artifact/visual links (`task_id`, `artifact_title?`, `visual_state_id?`).
  - `find_blocked`: Find tasks blocked by decision (`decision_id`).
  - `find_stale`: Identify untouched or idle tasks (`older_than?`, `status?`).
  - `find_blockers`: Query active blockers for a node (`node_id`, `include_transitive?`).
  - `find_similar_blockers`: TF-IDF RAG search for similar resolved blockers (`query`, `threshold?`).
  - `auto_prune`: Automatically transition stale in-progress tasks to target status (`older_than?`, `target_status?`).

---

### 5. `manage_snapshots`
Graph checkpoints and time travel.
- **Actions**:
  - `save`: Save graph checkpoint (`session_id?`, `force?`).
  - `list`: View saved snapshots (`limit?`).
  - `diff`: Compare two snapshot states (`snapshot_id_a`, `snapshot_id_b`).
  - `get_state`: Query graph state at ISO timestamp (`timestamp`).
  - `revert`: Roll back graph to ISO timestamp (`timestamp`).
  - `undo`: Undo last mutation on a node (`node_id`).
  - `get_history`: Audit history for a node (`node_id`).

---

### 6. `manage_specs`
Spec-Driven Development (SDD) & workflow templates.
- **Actions**:
  - `scaffold`: Generate feature spec template in `.specs/` (`title`).
  - `ingest`: Parse PRD or Gherkin file into graph nodes (`file_path`, `format?`).
  - `export`: Export spec node back to file (`spec_id`, `format?`).
  - `compliance`: Compute requirement verification coverage matrix.
  - `verify`: Mark acceptance criterion verified (`criterion_id`, `status?`, `observation_id?`).
  - `decompose_feature`: Decompose feature into plan/milestone/subtasks (`title`, `description?`, `subtasks?`).
  - `template`: Scaffold FDD or RFC template (`template: "fdd" | "rfc"`, `name`).

---

### 7. `manage_database`
Database maintenance, backups, and Git VCS state sync.
- **Actions**:
  - `backup`: Online SQLite database backup (`outputPath`).
  - `restore`: Restore database from backup file (`backupPath`, `force?`).
  - `audit`: Foreign key and integrity checks.
  - `merge`: Merge external SQLite state database (`sourcePath`, `force?`).
  - `branch_diff`: Diff graph state across git branches (`target_branch`).
  - `branch_merge`: Resolve branch state merge conflicts (`source_branch`, `target_branch`, `resolution_strategy`).

---

### 8. `manage_data`
Bulk import and export operations.
- **Actions**:
  - `export_graph`: Export graph in JSON, DOT, Mermaid, or HTML format (`format?`).
  - `export_issues`: Export tasks to GitHub or Jira JSON format (`format?`).
  - `export_trajectories`: Export agent trajectories as JSONL (`limit?`, `session_id?`, `since?`, `until?`).
  - `export_joint_trajectories`: Export interleaved state + visual trajectories (`limit?`, `session_id?`).
  - `export_synergy_metrics`: Retrieve dual-memory synergy and ROI metrics.
  - `import_graph`: Bulk import nodes and edges (`nodes: [...]`, `edges: [...]`, `force?`).
  - `import_issues`: Bulk import external issues (`issues: [...]`).
  - `import_spec`: Import PRD or Gherkin spec (`file_path`, `format?`).

---

### 9. `query_graph`
Graph topology and query capabilities.
- **Actions**:
  - `subgraph`: Fetch N-hop neighborhood around root node (`root_id`, `depth?`).
  - `trace`: Trace dependency paths upstream/downstream with cycle detection (`node_id`, `direction?`, `max_depth?`).
  - `raw`: Safe read-only SELECT query against SQLite (`sql`, `params?`).
  - `natural_language`: Execute natural language query (`query`).

---

### 10. `get_analytics`
Workflow analytics, metrics, and decision lineages.
- **Actions**:
  - `summary`: Overview of nodes, edges, active blockers, and progress.
  - `velocity`: Task completion velocity and duration stats (`window_days?`).
  - `burndown`: Time-series remaining task estimates (`days?`).
  - `value_metrics`: Token savings, ROI, and efficiency calculations.
  - `cognitive_load`: Intrinsic (ICL) and Extraneous (ECL) load metrics.
  - `critical_path`: Longest chain of unfinished tasks to milestone (`milestone_id?`).
  - `context_snapshot`: Single-call overview for agent alignment.
  - `decision_trail`: Trace decision lineage upstream and downstream (`node_id`).
  - `find_related_decisions`: Find decisions referencing an artifact (`artifact_id`).
  - `contradictions`: Audit conflicting decisions and invalid states.

---

### 11. `get_events`
Event audit ledger and post-mortems.
- **Actions**:
  - `log`: Query append-only event ledger (`session_id?`, `since?`, `until?`, `limit?`).
  - `changelog`: Structured graph diff since timestamp or session (`since?`, `since_session?`, `git_branch?`).
  - `post_mortem`: Generate structured markdown post-mortem report for session (`session_id?`).

---

### 12. `run_diagnostics`
Health checks, integrity validation, compaction, and metadata.
- **Actions**:
  - `validate`: Graph validation checks for cycles, orphans, dangling edges (`checks?`).
  - `doctor`: Comprehensive health report for SQLite, schema, and storage.
  - `check_refs`: Validate file paths and code symbols (`auto_heal?`).
  - `audit_chain`: Verify cryptographic SHA-256 event hash integrity.
  - `compact`: Reclaim SQLite storage space and vacuum (`prune_orphaned_edges?`).
  - `archive`: Archive old completed tasks (`older_than_days?`).
  - `prune_events`: Permanently prune historical events (`older_than?`, `dry_run?`, `preserve_types?`). *Requires `STATE_MEMORY_ADMIN_MODE=true`*.
  - `version`: Retrieve server and runtime environment version metadata.

---

### 13. `use_blackboard`
Multi-agent notice board.
- **Actions**:
  - `post`: Post notice to shared topic (`topic`, `content`, `agent_id?`, `agent_role?`, `ttl_seconds?`).
  - `read`: Read active non-expired blackboard notices (`topic?`, `limit?`).
