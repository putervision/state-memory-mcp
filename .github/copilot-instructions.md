## State Memory (state-memory-mcp)

This project tracks workflow state, tasks, design decisions, and blockers using `state-memory-mcp` with project slug `"state-memory-mcp"`.

### 1. Priority Order
Before doing any coding or investigation:
1. `get_project_summary` — Always run this first to understand current project state, active branches, and overall progress.
2. `find_blockers` — Identify any active blockers preventing progress.
3. `list_nodes` — Find pending tasks, past decisions, or milestones.
4. `trace_dependencies` — Trace what depends on or blocks a task.

### 2. When to Write to the Graph
You MUST update the graph as you work:
- **Starting a new task**: Create a node with `add_node(type: "task", title: "...")`.
- **Making a design or implementation decision**: Document it with `add_node(type: "decision", title: "...", metadata: { "rationale": "..." })`.
- **Encountering a blocker**: Record the blocker with `add_node(type: "blocker", ...)` and connect it to the blocked task using `add_edge(type: "blocks", source_id: blocker_id, target_id: task_id)`.
- **Completing a task**: Update the status to done using `update_node(id: task_id, status: "done")`.
- **Creating/generating a new file**: Create an artifact node with `add_node(type: "artifact", ...)` and connect it using `add_edge(type: "produces")`.

### 3. Workflow Pattern
1. **Start of session**: Run `get_project_summary` and `find_blockers` to align on current status.
2. **Task decomposition**: Decompose user requests into tasks and add them to the graph.
3. **Execution**: Mark tasks as "in_progress", document design decisions as they occur, and log blockers if you hit any obstacles.
4. **Resolution**: Mark tasks as "done", document completed artifacts, and resolve blockers.

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
