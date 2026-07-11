# Project Instructions Template

> **Note**: Running `state-memory-mcp init` in your project root will automatically create/append these instructions to all supported IDE instruction files. This template is kept as a reference.

---

# Project Instructions

## State Memory (state-memory-mcp)

This project tracks workflow state, tasks, design decisions, and blockers using `state-memory-mcp`.

### 1. Priority Order
Before doing any coding or investigation:
1. `start_session` — Start a tracking session for full change attribution.
2. `get_project_summary` — Run to understand current project state, active branches, and overall progress.
3. `next_tasks` — Query prioritized runnable tasks.
4. `find_blockers` — Identify any active blockers preventing progress.
5. `list_nodes` — Find pending tasks, past decisions, or milestones.
6. `trace_dependencies` — Trace what depends on or blocks a task.

### 2. When to Write to the Graph
You MUST update the graph as you work:
- **Starting a session**: Always call `start_session(agent_id: "my-agent")` to track all mutations under a unique session.
- **Starting a new task**: Create a node with `add_node(type: "task", title: "...", session_id: session_id)`.
- **Making a design or implementation decision**: Document it with `add_node(type: "decision", title: "...", metadata: { "rationale": "..." }, session_id: session_id)`.
- **Encountering a blocker**: Record the blocker with `add_node(type: "blocker", ..., session_id: session_id)` and connect it using `add_edge(type: "blocks", source_id: blocker_id, target_id: task_id, session_id: session_id)`.
- **Adding observation notes**: Atomically log notes using `add_note(text: "...", attach_to: node_id)`.
- **Batch updates**: Bulk update tasks/nodes using `batch_update(ids: ["..."], status: "done")`.
- **Completing a task**: Update status to done using `update_node(id: task_id, status: "done", session_id: session_id)`.
- **Creating/generating a new file**: Create an artifact node with `add_node(type: "artifact", ..., session_id: session_id)` and connect it using `add_edge(type: "produces", ..., session_id: session_id)`.

### 3. Workflow Pattern
1. **Start of session**: Call `start_session` to align and track work, then run `get_project_summary`, `next_tasks`, and `find_blockers`.
2. **Task decomposition**: Decompose user requests into tasks and add them to the graph.
3. **Execution**: Mark tasks as "in_progress", document design decisions as they occur, and log blockers if you hit any obstacles.
4. **Validation & Resolution**: Run `validate_graph` to ensure no cycles/orphans/contradictions, mark tasks as "done", document completed artifacts, and resolve blockers. Call `end_session` to finalize.

