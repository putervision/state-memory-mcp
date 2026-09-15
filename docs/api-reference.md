# 📘 @putervision/state-memory-mcp Formal API Reference (v1.2.1 — 13 Consolidated Tools)

This document provides formal API specifications, parameter schemas, return shapes, and example JSON payloads for the **13 consolidated Model Context Protocol (MCP) tools** provided by `@putervision/state-memory-mcp`.

---

## 1. Graph & Node Management

### `manage_nodes`
Unified tool for graph node creation, updates, querying, search, and batch mutations.

#### Actions:
- `create`: Add a single node (`task`, `decision`, `artifact`, `plan`, `milestone`, `blocker`, `observation`, `spec`, `requirement`, `acceptance_criterion`, `visual_state`).
- `update`: Update properties and status of an existing node. Supports optimistic concurrency version checking.
- `get`: Fetch single node details with optional inbound and outbound edges.
- `remove`: Delete a node and cascade-delete connected edges.
- `list`: Filter nodes by type, status, git branch, or tags.
- `search`: Full-text (FTS5) or vector TF-IDF search.
- `batch_create`: Insert multiple node objects atomically in a single transaction.
- `batch_update`: Update status, tags, or metadata across multiple node IDs atomically.
- `add_note`: Create an observation node and optionally attach it via a `references` edge.

#### Example Request (`create`):
```json
{
  "action": "create",
  "project": "my-app",
  "type": "decision",
  "title": "Adopt SQLite WAL mode for persistent graph memory",
  "status": "accepted",
  "metadata": { "rationale": "Zero network latency and atomic multi-process reads" },
  "tags": ["architecture", "database"]
}
```

---

### `manage_edges`
Manage typed relationships between graph nodes and multimodal visual memory links.

#### Actions:
- `add`: Add a typed edge between two nodes (`depends_on`, `blocks`, `produces`, `references`, `updates`, `contradicts`, `part_of`, `child_of`, `implements`, `decided_in`, `verifies`, `satisfies`, `renders_state`, `blocked_by_visual_state`, `verifies_visual_state`).
- `remove`: Remove a specific typed relationship.
- `batch_add`: Add multiple edge objects in a single atomic transaction.
- `link_visual`: Link a task, artifact, or blocker to a `vision-memory-mcp` visual state ID.

#### Example Request (`add`):
```json
{
  "action": "add",
  "project": "my-app",
  "source_id": "01KYBJ...",
  "target_id": "01KYBK...",
  "type": "depends_on"
}
```

---

## 2. Agent Sessions & Task Execution

### `manage_sessions`
Agent tracking session lifecycle management.

#### Actions:
- `start`: Start tracking mutations under a unique session ID.
- `end`: Conclude a tracking session.
- `list`: List all active and historical sessions.
- `bootstrap`: Single-turn session start returning context snapshot and prioritized tasks.

---

### `manage_tasks`
Task prioritization, completion, and blocker resolution.

#### Actions:
- `next`: Retrieve prioritized unblocked runnable tasks with dependency and blocker context.
- `complete`: Mark task `done`, optionally generate artifact and attach visual verification proof.
- `find_blocked`: Find all tasks blocked downstream by a specific decision.
- `find_stale`: Identify stale or idle tasks.
- `find_blockers`: Query all active blockers on a node (including transitive blockers).
- `find_similar_blockers`: RAG vector search for similar historical blockers and resolutions.
- `auto_prune`: Automatically transition stale tasks to a target status.

---

## 3. Snapshots, Time Travel & SDD Specs

### `manage_snapshots`
State snapshots, time-travel history, and undo.

#### Actions:
- `save`: Create a named snapshot checkpoint of the graph.
- `list`: List saved snapshots.
- `diff`: Compute structural diff between two snapshots.
- `get_state`: Query graph state at a specific ISO timestamp.
- `revert`: Roll back graph to a historical timestamp.
- `undo`: Undo last mutation on a node.
- `get_history`: Retrieve chronological event history for a node.

---

### `manage_specs`
Spec-Driven Development (SDD) PRD lifecycle and workflow templates.

#### Actions:
- `scaffold`: Generate a spec template in `.specs/`.
- `ingest`: Parse PRD or Gherkin file into graph nodes.
- `export`: Export spec graph hierarchy back to Markdown or Gherkin.
- `compliance`: Compute requirement verification coverage matrix.
- `verify`: Mark acceptance criterion `verified`, `failing`, or `skipped`.
- `decompose_feature`: Decompose feature into plan, milestones, and subtasks.
- `template`: Scaffold FDD or RFC workflow templates.

---

## 4. Database, Data & VCS Sync

### `manage_database`
Physical SQLite database operations and VCS branch state synchronization.

#### Actions:
- `backup`: Create an online SQLite backup file.
- `restore`: Restore database from backup file.
- `audit`: Physical database integrity and foreign key check.
- `merge`: Merge external SQLite state database.
- `branch_diff`: Diff graph state across git branches.
- `branch_merge`: Resolve branch state merge conflicts with resolution strategies (`ours`, `theirs`, `union`).

---

### `manage_data`
Bulk import and export operations.

#### Actions:
- `export_graph`: Export graph in JSON, DOT, Mermaid, or HTML.
- `export_issues`: Export tasks to GitHub or Jira JSON format.
- `export_trajectories`: Export agent trajectories as JSONL fine-tuning data.
- `export_joint_trajectories`: Export interleaved state + visual trajectories.
- `export_synergy_metrics`: Retrieve dual-memory synergy and ROI metrics.
- `import_graph`: Bulk import nodes and edges.
- `import_issues`: Bulk import external issues.
- `import_spec`: Import PRD or Gherkin spec.

---

## 5. Analytics, Events & Diagnostics

### `query_graph`
Graph traversal, dependency tracing, and queries.

#### Actions:
- `subgraph`: Extract N-hop neighborhood around root node.
- `trace`: Trace dependency chains upstream or downstream with cycle detection.
- `raw`: Safe read-only SELECT query against SQLite.
- `natural_language`: Execute natural language query against graph state.

---

### `get_analytics`
Workflow analytics, metrics, and decision lineages.

#### Actions:
- `summary`: Overview of nodes, edges, blockers, and progress.
- `velocity`: Task completion velocity and duration stats.
- `burndown`: Time-series remaining task estimates.
- `value_metrics`: Token savings, ROI, and efficiency calculations.
- `cognitive_load`: Intrinsic (ICL) and Extraneous (ECL) load metrics.
- `critical_path`: Longest chain of unfinished tasks to milestone.
- `context_snapshot`: Single-call overview for agent alignment.
- `decision_trail`: Trace decision lineage upstream and downstream.
- `find_related_decisions`: Find decisions referencing an artifact.
- `contradictions`: Audit conflicting decisions and invalid states.

---

### `get_events`
Cryptographic event ledger and session post-mortems.

#### Actions:
- `log`: Query append-only event ledger with filters.
- `changelog`: Structured graph diff since timestamp or session.
- `post_mortem`: Generate structured markdown post-mortem report for session.

---

### `run_diagnostics`
Health checks, integrity validation, compaction, and metadata.

#### Actions:
- `validate`: Graph validation checks for cycles, orphans, dangling edges.
- `doctor`: Comprehensive health report for SQLite, schema, and storage.
- `check_refs`: Validate file paths and code symbols.
- `audit_chain`: Verify cryptographic SHA-256 event hash integrity.
- `compact`: Reclaim SQLite storage space and vacuum.
- `archive`: Archive old completed tasks.
- `prune_events`: Permanently prune historical events. *Requires `STATE_MEMORY_ADMIN_MODE=true`*.
- `version`: Retrieve server and runtime environment version metadata.

---

### `use_blackboard`
Multi-agent notice board.

#### Actions:
- `post`: Post notice to shared topic.
- `read`: Read active non-expired blackboard notices.
