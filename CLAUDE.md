## State Memory (state-memory-mcp)

This project tracks workflow state, tasks, design decisions, and blockers using `state-memory-mcp` with project slug `"state-memory-mcp"`.

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

### 4. Codebase Seeding on Initialization
If the project was just initialized or is missing high-level structure (Plans, Milestones, Decisions):
1. **Inspect the Codebase**: Read the README and core files to understand the roadmap and architecture.
2. **Scaffold the Roadmap**: Create a `plan` node (e.g., "Project Roadmap") and add `milestone` nodes representing key target phases, connecting them using `part_of` edges.
3. **Scaffold Architecture**: Create `decision` nodes representing core technical choices (e.g., choice of databases, frameworks) and link them to the milestones/tasks using `decided_in` edges.



## Visual Memory (vision-memory-mcp)

This project utilizes `vision-memory-mcp` to cache visual states, record layout transitions, and avoid repetitive LLM vision calls.

### 1. Mandatory Workflow & Priority
1. **Orient**: Call `get_session_context` to align your state context at the start of work.
2. **Search**: Call `recall_memory` (text/image search) before recreating duplicate UI state paths.
3. **Ingest/Verify**: ALWAYS call `analyze_screenshot` before querying any front-end vision models.
   - **Cache Hit (`is_known: true`)**: Do NOT use vision models; read the returned `description` as context.
   - **Cache Miss (`is_known: false`)**: Query your vision model, then run `analyze_screenshot` with both the image and description to seed the cache.
4. **Transitions**: Call `record_outcome` after every click/type/scroll action to construct navigation paths.
5. **Undo**: Call `undo_last_visual_mutation` to revert accidental state or edge ingestions.

### 2. Tool Reference Summary
* `analyze_screenshot`: Ingest screenshot, lookup cache, return layout description.
* `recall_memory`: Search visual memory by description query or base64 image query.
* `record_outcome`: Save UI action execution outcomes and transitions between states.
* `get_navigation_paths`: Find path between states using BFS navigation graph.
* `compare_states`: Compare two visual states structurally and vector-semantically.
* `get_session_context`: Fetch recent states, frequent states, and transitions.
* `save_visual_snapshot` / `diff_visual_snapshots`: Manage visual checkpoints and detect visual regression.
* `undo_last_visual_mutation`: Revert the last visual mutation.

#### 3. Agent Permissions & Auto-Run Configuration
To allow cache query and ingestion commands to run automatically without prompting:
* **Google Antigravity (`~/.gemini/config/config.json`)**: Add these rules to your `"globalPermissionGrants"` -> `"allow"` list:
  * `"command(vision-memory-mcp)"` (Allow running the CLI without parameters prompts)
  * `"read_file(.*\\.gemini/antigravity/brain/.*)"` (Allow reading captured screenshots)
  * `"write_file(.*\\.gemini/antigravity/brain/.*)"` (Allow saving visual states)
* **VS Code / Cursor IDE (`settings.json`)**: Ensure the agent has execution permissions for `command(vision-memory-mcp)` and read/write access to the workspace's local `.vision-memory-mcp/` cache directory.
