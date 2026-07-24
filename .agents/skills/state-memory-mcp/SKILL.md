---
name: state-memory-mcp
description: Teaches the agent to use the state-memory-mcp MCP server to track workflow state, tasks, decisions, blockers, artifacts, plans, milestones, and their semantic relationships in a persistent graph database.
---

# State Memory (state-memory-mcp)

This project uses `state-memory-mcp` with project slug `"state-memory-mcp"` to provide AI agents with a structured, persistent graph for tracking workflow state.

### 1. Priority Order & Mandatory Checklist
Before doing any coding or investigation, you MUST run this sequence:
1. `start_session` — Start a tracking session with an `agent_id` for full change attribution.
2. `get_project_summary` — Understand current project state, active branches, and overall progress.
3. `next_tasks` — Query prioritized runnable tasks (sorted by downstream impact and age).
4. `find_blockers` — Identify any active blockers preventing progress.
5. `list_nodes` — Find pending tasks, past decisions, or milestones.
6. `trace_dependencies` — Trace what depends on or blocks a task.

### 2. Complete Tool Reference

#### Node CRUD
| Tool | Key Inputs | Description |
|------|------------|-------------|
| `add_node` | `type`, `title`, `status?`, `metadata?`, `tags?` | Create a new node (task, decision, artifact, plan, blocker, milestone, observation). |
| `update_node` | `id`, `title?`, `status?`, `metadata?`, `tags?` | Update properties of an existing node. |
| `get_node` | `id` | Retrieve a node by its unique ID. |
| `remove_node` | `id` | Delete a node and its connected edges. |

#### Edge Relationships
| Tool | Key Inputs | Description |
|------|------------|-------------|
| `add_edge` | `source_id`, `target_id`, `type` | Create a typed relationship between two nodes. Types: `depends_on`, `blocks`, `produces`, `references`, `updates`, `contradicts`, `part_of`, `child_of`, `implements`, `decided_in`, `extends`, `modifies`, `renders_state`. |
| `remove_edge` | `id` | Delete an edge by its ID. |

#### Discovery & Search
| Tool | Key Inputs | Description |
|------|------------|-------------|
| `list_nodes` | `type?`, `status?`, `tags?`, `limit?` | List nodes with optional filters. |
| `search_nodes` | `query`, `type?`, `status?` | Full-text search across node titles and metadata using FTS5. |
| `get_subgraph` | `root_id`, `depth?` | Get a subgraph starting from a root node. |

#### Dependency & Analysis
| Tool | Key Inputs | Description |
|------|------------|-------------|
| `trace_dependencies` | `id`, `direction?`, `depth?` | Trace dependency chains upstream or downstream. |
| `find_blockers` | `project` | Find all active blockers and what they block. |
| `critical_path` | `milestone_id` | Compute the longest chain of unfinished tasks blocking a milestone. |
| `impact_analysis` | `id` | Calculate the downstream blast radius if a node changes. |
| `detect_contradictions` | `project` | Audit for logical flaws (e.g., done tasks with active blockers). |
| `decision_trail` | `id` | Trace the historical lineage of updates and contradictions back to the original decision. |
| `find_related_decisions` | `id` | Find decisions related to a node through edges. |
| `find_blocked_tasks` | `project` | Find tasks that are blocked by other incomplete tasks. |

#### Project Overview
| Tool | Key Inputs | Description |
|------|------------|-------------|
| `get_project_summary` | `project` | Overview of node counts, status breakdown, active blockers, recent decisions, and progress percentage. |
| `get_context_snapshot` | `project` | Full context snapshot of the current graph state. |
| `value_metrics` | `project` | ROI, productivity, and token savings analytics. |
| `scaffold_template` | `template_key` | Generate pre-built node/edge templates for common patterns. |

#### Agent QoL & Batch Operations
| Tool | Key Inputs | Description |
|------|------------|-------------|
| `batch_update` | `ids`, `status?`, `metadata?`, `tags?` | Atomic batch updates of status, metadata, or tags across multiple nodes. |
| `next_tasks` | `project`, `limit?` | Prioritized runnable task queue sorted by downstream impact and age. |
| `what_changed` | `project`, `since?`, `session_id?` | Graph changeset diff since a session start or timestamp. |
| `get_stale_nodes` | `project`, `days?`, `type?` | Find idle/untouched nodes older than a threshold. |
| `validate_graph` | `project` | Topological and logic validation (cycles, orphans, empty milestones). |
| `add_note` | `text`, `attach_to?` | Atomically log an observation note with optional context link. |

#### Session & Event Tracking
| Tool | Key Inputs | Description |
|------|------------|-------------|
| `start_session` | `agent_id?`, `metadata?` | Start a tracked session. Returns `session_id` to stamp all mutations. |
| `end_session` | `session_id` | Conclude a session and log completion. |
| `get_event_log` | `project`, `node_id?`, `event_type?`, `session_id?` | Query the append-only event ledger with filters. |
| `get_node_history` | `id` | View every mutation event for a specific node in chronological order. |
| `undo_last` | `id` | Revert the last mutation on a node by restoring `before_state`. |
| `prune_events` | `project`, `older_than`, `dry_run?` | Prune old event log entries while preserving latest entity state. |

#### Snapshots & Export
| Tool | Key Inputs | Description |
|------|------------|-------------|
| `save_snapshot` | `project`, `name`, `description?` | Save the current graph state as a named checkpoint. |
| `list_snapshots` | `project` | List all saved checkpoints. |
| `diff_snapshots` | `project`, `snapshot_a`, `snapshot_b` | Compare two checkpoints for added/removed/updated nodes and edges. |
| `export_graph` | `project`, `format?` | Export graph data (JSON, DOT, Mermaid, HTML). |
| `import_graph` | `project`, `data` | Import graph data from JSON. |
| `export_trajectories` | `project`, `session_id?` | Export transition sequences in JSONL format for fine-tuning. |

#### Database Administration
| Tool | Key Inputs | Description |
|------|------------|-------------|
| `query_graph` | `project`, `sql` | Safe read-only SELECT queries against the database. |
| `backup_project_db` | `project`, `output_path?` | Back up the project database to a SQLite file. |
| `restore_project_db` | `project`, `input_path` | Restore from a backup (destructive overwrite). |
| `audit_project_db` | `project` | Run integrity and cycle checks on the database. |
| `merge_project_db` | `project`, `input_path`, `force?` | Merge an external database into the current project. |

### 3. Node Types & Edge Relationships

**Node Types:**
- `task` — Incremental items of work or coding TODOs.
- `decision` — Architectural choices, pattern selections, and rationale.
- `artifact` — Files, documentation, or schemas generated by tasks.
- `plan` — High-level development specifications and roadmaps.
- `milestone` — Progress checkpoints representing grouped sets of tasks.
- `blocker` — Impediments or bugs preventing task completion.
- `observation` — Contextual findings, notes, or runtime constraints.

**Edge Types:**
- `depends_on` — Task/milestone depends on another node.
- `blocks` — Blocker stalls a task/milestone.
- `produces` — Task/milestone generates an artifact.
- `references` — Node references documentation or source files.
- `updates` / `contradicts` — Decision history and conflict tracking.
- `part_of` / `child_of` — Hierarchical groupings (tasks in milestones, milestones in plans).
- `implements` / `decided_in` — Links tasks/artifacts to design decisions or plans.
- `extends` / `modifies` — Git commit trace relationships.
- `renders_state` — Visual memory verification relationship.

### 4. Workflow Patterns

**Session Lifecycle:**
1. `start_session(agent_id: "my-agent")` → get `session_id`
2. Pass `session_id` to all `add_node`, `update_node`, `add_edge` calls
3. `end_session(session_id)` when work is complete

**Task Decomposition:**
1. Decompose user requests into task nodes with `add_node(type: "task")`
2. Connect related tasks with `add_edge(type: "depends_on")`
3. Group under milestones with `add_edge(type: "part_of")`

**Codebase Seeding (on first init):**
If the project has no Plan or Milestone nodes:
1. Read README and core files to understand the roadmap and architecture.
2. Create a `plan` node (e.g., "Project Roadmap").
3. Add `milestone` nodes for key phases, connecting with `part_of` edges.
4. Create `decision` nodes for core technical choices, linking with `decided_in` edges.

### 5. CLI Commands Reference
```bash
state-memory-mcp init          # Initialize in current project
state-memory-mcp run           # Start the MCP server
state-memory-mcp inspect -p X  # ASCII table of project nodes
state-memory-mcp metrics -p X  # ROI and token savings analytics
state-memory-mcp view -p X     # Open 3D graph visualizer in browser
state-memory-mcp export -p X -f [json|dot|mermaid|html]  # Export graph
state-memory-mcp scan-git -p X # Incrementally scan git history
state-memory-mcp backup -p X   # Back up the database
state-memory-mcp audit -p X    # Run integrity checks
```
