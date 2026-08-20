# Project Instructions Template

> **Note**: Running `state-memory-mcp init` in your project root will automatically create/append these instructions to all supported IDE instruction files. This template is kept as a reference.

---

# Project Instructions

## State Memory (state-memory-mcp)

This project tracks workflow state, tasks, design decisions, and blockers using `state-memory-mcp`.

### 1. Priority Order
Before doing any coding or investigation:
1. `manage_sessions(action: "start")` — Start a tracking session for full change attribution.
2. `get_analytics(action: "summary")` — Run to understand current project state, active branches, and overall progress.
3. `manage_specs(action: "compliance")` — Check requirement coverage matrix and unfulfilled criteria.
4. `manage_tasks(action: "next")` — Query prioritized runnable tasks.
5. `manage_tasks(action: "find_blockers")` — Identify any active blockers preventing progress.
6. `manage_nodes(action: "list")` — Find pending tasks, past decisions, or milestones.
7. `query_graph(action: "trace")` — Trace what depends on or blocks a task.

### 2. When to Write to the Graph
You MUST update the graph as you work:
- **Starting a session**: Always call `manage_sessions(action: "start", agent_id: "my-agent")` to track all mutations under a unique session.
- **Ingesting specifications**: Use `manage_specs(action: "ingest", file_path: "...")` to load PRDs, OpenSpec files, or Gherkin BDD specs into graph `spec` and `requirement` nodes.
- **Starting a new task**: Create a node with `manage_nodes(action: "create", type: "task", title: "...", session_id: session_id)` and link to requirements via `manage_edges(action: "add", type: "satisfies", source_id: task_id, target_id: req_id)`.
- **Making a design decision**: Document it with `manage_nodes(action: "create", type: "decision", title: "...", session_id: session_id)`. If overriding a spec, link via `modifies` or `contradicts`.
- **Encountering a blocker**: Record the blocker with `manage_nodes(action: "create", type: "blocker", ..., session_id: session_id)` and connect it using `manage_edges(action: "add", type: "blocks", source_id: blocker_id, target_id: task_id, session_id: session_id)`.
- **Verifying requirements**: Call `manage_specs(action: "verify", criterion_id: "...")` after test/visual verification.
- **Completing a task**: Update status to done using `manage_tasks(action: "complete", task_id: task_id)` or `manage_nodes(action: "update", id: task_id, status: "done")`.
- **Creating/generating a new file**: Create an artifact node with `manage_nodes(action: "create", type: "artifact", ..., session_id: session_id)` and connect it using `manage_edges(action: "add", type: "produces", source_id: task_id, target_id: artifact_id)`.

### 3. Spec-Driven Workflow Pattern (SDD)
1. **Spec Ingestion & Scaffold**: Call `manage_specs(action: "ingest")` (or `manage_specs(action: "scaffold")` if starting fresh) to establish feature requirements in memory.
2. **Start of Session**: Call `manage_sessions(action: "start")`, run `get_analytics(action: "summary")`, `manage_specs(action: "compliance")`, and `manage_tasks(action: "next")`.
3. **Requirement Mapping**: Decompose requirements into tasks (`satisfies` edge) and set status to "in_progress".
4. **Execution & Traceability**: Document design decisions and code artifacts (`produces` / `implements` edges).
5. **Verification**: Run unit/visual tests and call `manage_specs(action: "verify")`.
6. **Validation & Resolution**: Run `run_diagnostics(action: "validate")` (checking `unfulfilled_specs`, `unverified_requirements`, `spec_drift`), mark tasks as "done", and call `manage_sessions(action: "end")`.

