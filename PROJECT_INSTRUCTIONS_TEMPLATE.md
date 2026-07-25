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
3. `get_spec_compliance` — Check requirement coverage matrix and unfulfilled criteria.
4. `next_tasks` — Query prioritized runnable tasks.
5. `find_blockers` — Identify any active blockers preventing progress.
6. `list_nodes` — Find pending tasks, past decisions, or milestones.
7. `trace_dependencies` — Trace what depends on or blocks a task.

### 2. When to Write to the Graph
You MUST update the graph as you work:
- **Starting a session**: Always call `start_session(agent_id: "my-agent")` to track all mutations under a unique session.
- **Ingesting specifications**: Use `ingest_spec(file_path: "...")` to load PRDs, OpenSpec files, or Gherkin BDD specs into graph `spec` and `requirement` nodes.
- **Starting a new task**: Create a node with `add_node(type: "task", title: "...", session_id: session_id)` and link to requirements via `add_edge(type: "satisfies", source_id: task_id, target_id: req_id)`.
- **Making a design decision**: Document it with `add_node(type: "decision", title: "...", session_id: session_id)`. If overriding a spec, link via `modifies` or `contradicts`.
- **Encountering a blocker**: Record the blocker with `add_node(type: "blocker", ..., session_id: session_id)` and connect it using `add_edge(type: "blocks", source_id: blocker_id, target_id: task_id, session_id: session_id)`.
- **Verifying requirements**: Call `verify_requirement(criterion_id: "...", observation_id: "...")` after test/visual verification.
- **Completing a task**: Update status to done using `update_node(id: task_id, status: "done", session_id: session_id)`.
- **Creating/generating a new file**: Create an artifact node with `add_node(type: "artifact", ..., session_id: session_id)` and connect it using `add_edge(type: "produces", ..., session_id: session_id)`.

### 3. Spec-Driven Workflow Pattern (SDD)
1. **Spec Ingestion & Scaffold**: Call `ingest_spec` (or `scaffold_spec` if starting fresh) to establish feature requirements in memory.
2. **Start of Session**: Call `start_session`, run `get_project_summary`, `get_spec_compliance`, and `next_tasks`.
3. **Requirement Mapping**: Decompose requirements into tasks (`satisfies` edge) and set status to "in_progress".
4. **Execution & Traceability**: Document design decisions and code artifacts (`produces` / `implements` edges).
5. **Verification**: Run unit/visual tests and call `verify_requirement`.
6. **Validation & Resolution**: Run `validate_graph` (checking `unfulfilled_specs`, `unverified_requirements`, `spec_drift`), mark tasks as "done", and call `end_session`.

