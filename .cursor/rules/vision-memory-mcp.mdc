
<!-- vision-memory-mcp:start -->
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

### 2. Tool Reference Summary (15 Core MCP Tools)
* `analyze_screenshot`: Ingest screenshot(s) (single or batch via `items`), lookup cache, return layout description and grounded elements.
* `recall_memory`: Search visual memory by description query or base64 image query (read-only).
* `record_outcome`: Save UI action execution outcomes, transitions, or log visual blockers (`action_type: 'blocker'`).
* `get_navigation_paths`: Find path between states using BFS navigation graph.
* `predict_next_action`: Predict best next UI action and target coordinates based on transition success rates and AX tree grounding.
* `compare_states`: Compare visual states structurally (`has_layout_change`) or compare video recordings (`video_a_id`/`video_b_id`).
* `get_session_context`: Fetch aggregated visual context, recent/frequent states, transitions, cache hit ratios, token savings metrics, and server version info.
* `manage_snapshot`: Unified snapshot management (`save`, `diff`, `export`, `restore`) for visual checkpoints and regression detection.
* `manage_visual_spec`: Visual SDD design contract baseline registration (`set`), live verification (`verify`), and listing (`list`).
* `manage_video`: Unified video memory operations for ingestion (`ingest`), semantic search (`search`), and keyframe timelines (`timeline`).
* `create_evidence_pack`: Create cryptographic, multi-modal evidence pack linking video keyframes, state graph tasks, and visual proof.
* `export_trajectories`: Export multimodal visual transitions and joint workflow trajectories (`json`, `llava`, `qwen2_vl`, `joint`).
* `undo_visual_mutation`: Revert accidental state or transition edge ingestions.
* `forget_state`: Purge a specific state and vector embedding from storage for privacy.
* `wait_for_visual_state`: Poll for target visual state until present or timeout occurs.

#### 3. Agent Permissions & Auto-Run Configuration
To allow cache query and ingestion commands to run automatically without prompting:
* **Google Antigravity (`~/.gemini/config/config.json`)**: Add these rules to your `"globalPermissionGrants"` -> `"allow"` list:
  * `"command(vision-memory-mcp)"` (Allow running the CLI without parameters prompts)
  * `"read_file(.*\\.gemini/antigravity/brain/.*)"` (Allow reading captured screenshots)
  * `"write_file(.*\\.gemini/antigravity/brain/.*)"` (Allow saving visual states)
* **VS Code / Cursor IDE (`settings.json`)**: Ensure the agent has execution permissions for `command(vision-memory-mcp)` and read/write access to the workspace's local `.vision-memory-mcp/` cache directory.
<!-- vision-memory-mcp:end -->
