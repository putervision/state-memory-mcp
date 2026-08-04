# Tool Reference (82 Tools), Resources & Prompts

`state-memory-mcp` exposes 82 Core MCP Tools across 9 structured operational categories, along with standard MCP read-only Resources and dynamic Prompts.

---

## 82 Core MCP Tools Reference

### 🚀 High-Level Compound Workflow Tools (4 Tools)
* **`bootstrap_session`**: Single-turn session initialization combining session tracking (`start_session`), context snapshot generation, and top unblocked tasks retrieval.
  * Inputs: `project`, `agent_id`, `metadata`, `task_limit`.
* **`complete_task`**: Single-turn task completion that updates task status to `'done'`, optionally creates a produced `'artifact'` node, and links them via a `'produces'` relationship.
  * Inputs: `task_id`, `artifact_title`, `artifact_metadata`, `tags`, `project`.
* **`batch_create_nodes`**: Atomically creates multiple nodes in a single transaction with SQLite FTS5 search index synchronization.
  * Inputs: `nodes`, `project`.
* **`batch_add_edges`**: Atomically creates multiple edge relationships with DAG cycle checks (`hasCycle`) and transaction rollback on failure.
  * Inputs: `edges`, `project`.

### 🟢 Node & Relationship Management (6 Tools)
* **`add_node`**: Creates a node (`task`, `decision`, `artifact`, `plan`, `observation`, `blocker`, `milestone`).
  * Inputs: `type`, `title`, `project`, `status`, `metadata`, `tags`.
* **`update_node`**: Modifies properties (title, status, metadata, tags) of an existing node.
  * Inputs: `id`, `project`, `title`, `status`, `metadata`, `tags`.
* **`get_node`**: Fetches a node's details and all inbound/outbound relationships.
  * Inputs: `id`, `project`, `include_edges`.
* **`remove_node`**: Deletes a node and automatically cascades deletions to all connected edges.
  * Inputs: `id`, `project`.
* **`add_edge`**: Links two nodes with a typed relationship (`depends_on`, `blocks`, `produces`, `references`, `decided_in`, `updates`, `contradicts`, `part_of`, `implements`, `child_of`, `extends`, `modifies`, `renders_state`). Cycles are rejected for directed dependency types.
  * Inputs: `source_id`, `target_id`, `type`, `project`, `properties`.
* **`remove_edge`**: Deletes a specific relationship between two nodes.
  * Inputs: `source_id`, `target_id`, `type`, `project`.

### 🔍 Search & Querying (4 Tools)
* **`list_nodes`**: Returns lists of nodes matching filters with support for selective field projection (`fields`), compact mode, pagination, tags, and branch tracking.
  * Inputs: `type`, `status`, `tags`, `project`, `limit`, `offset`, `compact`, `git_branch`, `fields`, `pretty_print`.
* **`search_nodes`**: Performs fast full-text search (FTS5) or TF-IDF cosine similarity search across title, metadata, and tags with field projection (`fields`).
  * Inputs: `query`, `type`, `status`, `limit`, `algorithm`, `fields`, `pretty_print`, `project`.
* **`get_subgraph`**: Extracts a node and its N-hop neighbor nodes and connecting relationships with field projection (`fields`).
  * Inputs: `root_id`, `depth`, `edge_types`, `node_types`, `fields`, `pretty_print`, `project`.
* **`query_graph`**: Executes safe, read-only SELECT SQL queries against the underlying database. Sanitized to block dangerous SQLite functions.
  * Inputs: `sql`, `params`, `project`.

### 🧠 Advanced Analytics & Tracing (8 Tools)
* **`trace_dependencies`**: Computes recursive upstream (requirements) or downstream (dependents) dependency chains.
  * Inputs: `node_id`, `direction`, `edge_types`, `max_depth`, `project`.
* **`find_blockers`**: Lists active blocker nodes and the tasks/milestones they block.
  * Inputs: `node_id`, `include_transitive`, `project`.
* **`get_project_summary`**: Provides a high-level project summary containing node breakdowns, task completion progress, recent decisions, and active blockers.
  * Inputs: `project`.
* **`decision_trail`**: Traces the historical chain of decisions that led to a given state (updates/contradicts).
  * Inputs: `node_id`, `project`.
* **`critical_path`**: Computes the longest chain of uncompleted tasks leading to a milestone (minimum set of tasks that must finish).
  * Inputs: `milestone_id`, `project`.
* **`impact_analysis`**: Calculates the downstream blast radius if a node is modified or deleted.
  * Inputs: `node_id`, `project`.
* **`detect_contradictions`**: Scans the project for logical flaws (e.g. completed tasks that still have active blockers, contradicting accepted decisions).
  * Inputs: `project`.
* **`value_metrics`**: Computes estimated time and token savings, graph density, orphan count, decision reuse rate, task velocity, and active blocker ages. Returns both structured JSON and a formatted Markdown report.
  * Inputs: `project`.

### 🤖 Agent QoL & Templates (4 Tools)
* **`get_context_snapshot`**: Dual-format context snapshot returning structured JSON data (blockers, pending tasks) and pre-rendered Markdown for quick agent prompting.
  * Inputs: `project`.
* **`find_related_decisions`**: Finds all decisions that affected a given artifact node (directly or via milestones).
  * Inputs: `artifact_id`, `project`.
* **`find_blocked_tasks`**: Finds all tasks blocked directly or transitively by a decision node.
  * Inputs: `decision_id`, `project`.
* **`scaffold_template`**: Automates scaffolding of standard development workflows. Supported templates: `fdd` (Feature-Driven Development design/build milestones & tasks) and `rfc` (Request for Comments author/review/decision loop).
  * Inputs: `template`, `name`, `project`.

### 🛡️ Administration & Backups (6 Tools)
* **`export_graph`**: Exports project graph to JSON, DOT, Mermaid flowchart, or interactive HTML formats.
  * Inputs: `format`, `project`.
* **`import_graph`**: Bulk loads nodes and edges from external files.
  * Inputs: `nodes`, `edges`, `project`.
* **`backup_project_db`**: Creates an online SQLite database backup file along with an integrity SHA-256 checksum file.
  * Inputs: `outputPath`, `project`.
* **`restore_project_db`**: Restores the database from a backup file, checking the structural SQLite integrity and matching the SHA-256 checksum file.
  * Inputs: `backupPath`, `project`.
* **`audit_project_db`**: Audits database structure, foreign key constraints, orphaned edges, cycles, and logical contradictions.
  * Inputs: `project`.
* **`merge_project_db`**: Safely merges two project databases, keeping the newer node (based on `updated_at`) and validating circular dependencies.
  * Inputs: `sourcePath`, `force`, `project`.

### ⏱️ Event Sourcing & Trajectories (9 Tools)
* **`start_session`**: Starts a tracking session for mutations.
  * Inputs: `agent_id`, `project`, `metadata`.
* **`end_session`**: Concludes an active session.
  * Inputs: `session_id`, `project`.
* **`get_event_log`**: Retrieves mutation event logs.
  * Inputs: `session_id`, `entity_id`, `event_type`, `since`, `until`, `limit`, `offset`, `project`.
* **`get_node_history`**: Fetches modification history for a specific node.
  * Inputs: `node_id`, `project`.
* **`undo_last`**: Undoes the last mutation event on a specific node.
  * Inputs: `node_id`, `project`.
* **`save_snapshot`**: Saves a full static graph snapshot.
  * Inputs: `session_id`, `project`.
* **`list_snapshots`**: Lists saved snapshots.
  * Inputs: `limit`, `project`.
* **`diff_snapshots`**: Computes changes (added, removed, status/property changes) between two snapshots.
  * Inputs: `snapshot_id_a`, `snapshot_id_b`, `project`.
* **`export_trajectories`**: Exports trajectories in JSONL format for agent training.
  * Inputs: `session_id`, `since`, `until`, `limit`, `offset`, `project`.

### ⚡ Batch & Staleness Utilities (8 Tools)
* **`batch_update`**: Executes atomic batch node updates (status, metadata, tags).
  * Inputs: `ids`, `status`, `metadata`, `tags`, `project`.
* **`next_tasks`**: Suggests next runnable tasks based on priority, blocker status, branch, and field projection (`fields`).
  * Inputs: `git_branch`, `limit`, `include_context`, `fields`, `pretty_print`, `project`.
* **`what_changed`**: Reports graph changeset diffs since a session start or timestamp.
  * Inputs: `since`, `since_session`, `git_branch`, `project`.
* **`get_stale_nodes`**: Identifies nodes that have been inactive/untouched for longer than a given threshold.
  * Inputs: `older_than`, `status`, `type`, `git_branch`, `limit`, `project`.
* **`validate_graph`**: Validates the graph for structural anomalies with self-healing auto-fix option (`auto_fix: true`).
  * Inputs: `checks`, `auto_fix`, `project`.
* **`prune_events`**: Prunes event logs older than a threshold while preserving entity states.
  * Inputs: `older_than`, `dry_run`, `preserve_types`, `project`.
* **`add_note`**: Atomically creates an observation note and references an existing node.
  * Inputs: `text`, `attach_to`, `tags`, `project`.
* **`app_version`**: Returns server package name, MCP identifier string, build version, server description, and runtime environment.
  * Inputs: `project` (optional).

---

## MCP Resources & Prompts

`state-memory-mcp` is fully compliant with the Model Context Protocol specification, exposing read-only data resources, dynamic URI templates, and reusable prompt templates.

### 📁 Resources & Templates

Resources provide direct read-only context to LLMs. `state-memory-mcp` registers the following resources under the `state-memory:///` URI scheme:

* **`state-memory:///{project}/summary`**: Returns the structured project summary (counts, task progress, recent decisions).
* **`state-memory:///{project}/blockers`**: Returns the list of all active blockers and their affected nodes.
* **`state-memory:///{project}/tasks/next`**: Returns top unblocked runnable tasks.
* **`state-memory:///{project}/node/{id}`**: Returns individual node details and connected relationships.
* **`state-memory:///{project}/metrics`**: Returns project velocity and value creation metrics.
* **`state-memory:///{project}/decisions`**: Returns the log of recent accepted decisions.
* **`state-memory:///{project}/graph.json`**: Returns a full node/edge database export as raw JSON.

### 💬 Prompts

Prompts are reusable workflow templates that streamline agent interactions:

* **`session-start`**: Generates a startup workspace overview, outlining the project summary, active blockers, and immediate pending tasks.
  * Arguments: `project` (optional).
* **`handover-summary`**: Generates context summary for agent-to-agent session handoffs and recent event logs.
  * Arguments: `project` (optional).
* **`task-decomposition`**: Guides model through decomposing a milestone into a task DAG with dependency links.
  * Arguments: `milestone_title` (required), `project` (optional).
* **`post-mortem`**: Prompts post-mortem analysis of stale/cancelled tasks and decision record updates.
  * Arguments: `project` (optional).
* **`plan-feature`**: Prompts the agent to plan out a new feature, guiding milestone creation, task decomposition, dependency mapping, and design decisions.
  * Arguments: `feature_name` (required), `project` (optional).
* **`review-decisions`**: Prompts the agent to review the decision log and logical contradictions audit, recommending improvements or fixes.
  * Arguments: `project` (optional).
* **`triage-blockers`**: Triages active blockers, helping to analyze the critical path and devise mitigation strategies.
  * Arguments: `project` (optional).
