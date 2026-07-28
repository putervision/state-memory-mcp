<!-- state-memory-mcp:start -->
# Workflow State Memory (state-memory-mcp)

This project uses `state-memory-mcp` with project slug `"state-memory-mcp"` to track tasks, decisions, blockers, and progress.
ALWAYS update the state graph when performing work.

## Mandatory Workflow
1. **Start of session**: Call `start_session(agent_id: "...")`, then run `get_project_summary` and `next_tasks` BEFORE any coding.
2. **Before work**: Create or find the task node, set status to `in_progress`.
3. **During work**: Log decisions (`add_node type: decision`), blockers (`add_node type: blocker`), and notes (`add_note`).
4. **Visual Consistency (Dual Memory)**:
   - For UI / layout tasks, capture visual evidence using `vision-memory-mcp:analyze_screenshot`.
   - Link visual proof via `link_visual_state(target_id: task_id, visual_state_id: vs_id, relationship: "renders_state")`.
   - Log visual blockers using `create_visual_blocker` or `link_visual_state(..., relationship: "blocked_by_visual_state")`.
5. **After work**: Run `validate_graph`, set task status to `done`, create artifact nodes, and call `end_session`.

## Tool Priority Order
1. `start_session` — track all mutations under a unique session
2. `get_project_summary` — current state and progress
3. `next_tasks` — query prioritized runnable tasks
4. `link_visual_state` — connect task/artifact nodes to visual states
5. `find_blockers` — what's blocking progress
6. `validate_graph` — check for cycle or logic anomalies
7. `export_joint_trajectories` — export interleaved state + vision logs

## Node Types
`task`, `decision`, `artifact`, `plan`, `milestone`, `blocker`, `observation`, `visual_state`

## Edge Types
`depends_on`, `blocks`, `produces`, `references`, `updates`, `contradicts`, `part_of`, `child_of`, `implements`, `decided_in`, `renders_state`, `blocked_by_visual_state`, `verifies_visual_state`

## Quick Reference
- **Batch updates**: `batch_update(ids: [...], status: "done")`
- **Quick notes**: `add_note(text: "...", attach_to: node_id)`
- **Synergy metrics**: `get_synergy_metrics()`
- **What changed**: `what_changed(since: "2h")` or `what_changed(session_id: "...")`

> For the complete tool reference and workflow patterns, see the `state-memory-mcp` skill in `.agents/skills/state-memory-mcp/SKILL.md`.
<!-- state-memory-mcp:end -->


## Visual Memory (vision-memory-mcp)

This project utilizes `vision-memory-mcp` to cache visual states, record layout transitions, provide element grounding, and avoid repetitive LLM vision calls.

### 1. Mandatory Workflow & Priority
1. **Orient**: Call `get_session_context` to align your visual state context at the start of work.
2. **Search**: Call `recall_memory` (text/image search) before recreating duplicate UI state paths.
3. **Ingest/Verify**: ALWAYS call `analyze_screenshot` before querying any front-end vision models.
   - **Cache Hit (`is_known: true`)**: Do NOT use vision models; read the returned `description` as context and use `grounded_elements` (selectors, coordinates) for action target selection.
   - **Cache Miss (`is_known: false`)**: Query your vision model, then run `analyze_screenshot` with both the image and description to seed the cache.
4. **Action Target Execution**: Use `predict_next_action` to retrieve `grounded_target` handles (`target_selector`, `target_coords`) for deterministic UI clicks and typing.
5. **Transitions**: Call `record_outcome` after every click/type/scroll action to construct navigation paths.
6. **Privacy & Cleanup**: Call `forget_state` to purge sensitive or secret states from storage.

### 2. Tool Reference Summary (20 Core MCP Tools)
* `analyze_screenshot`: Ingest screenshot, lookup cache, return layout description and grounded elements.
* `recall_memory`: Search visual memory by description query or base64 image query.
* `record_outcome`: Save UI action execution outcomes and transitions between states.
* `get_navigation_paths`: Find path between states using BFS navigation graph.
* `compare_states`: Compare two visual states structurally and vector-semantically.
* `get_session_context`: Fetch recent states, frequent states, and transitions.
* `predict_next_action`: Predict best next UI action and target coordinates based on transition success rates.
* `batch_analyze_screenshots`: Process multiple screenshots in a single batch call.
* `set_visual_spec` / `verify_visual_spec` / `get_visual_diff`: UI compliance testing and mockup verification.
* `save_visual_snapshot` / `diff_visual_snapshots`: Manage visual checkpoints and detect visual regression.
* `undo_last_visual_mutation`: Revert accidental state or transition edge ingestions.
* `forget_state`: Purge a specific state and vector embedding from storage for privacy.
* `export_visual_trajectories`: Export multimodal transition trajectories (JSON / LLaVA format) for fine-tuning.
* `get_metrics`: Query real-time cache hit ratios, latency metrics, and token-savings estimates.
* `export_snapshot` / `restore_snapshot`: Export and restore full standalone snapshot archives.

#### 3. Agent Permissions & Auto-Run Configuration
To allow cache query and ingestion commands to run automatically without prompting:
* **Google Antigravity (`~/.gemini/config/config.json`)**: Add these rules to your `"globalPermissionGrants"` -> `"allow"` list:
  * `"command(vision-memory-mcp)"` (Allow running the CLI without parameters prompts)
  * `"read_file(.*\\.gemini/antigravity/brain/.*)"` (Allow reading captured screenshots)
  * `"write_file(.*\\.gemini/antigravity/brain/.*)"` (Allow saving visual states)
* **VS Code / Cursor IDE (`settings.json`)**: Ensure the agent has execution permissions for `command(vision-memory-mcp)` and read/write access to the workspace's local `.vision-memory-mcp/` cache directory.
