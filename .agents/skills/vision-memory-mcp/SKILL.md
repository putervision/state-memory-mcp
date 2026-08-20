---
name: vision-memory-mcp
description: Teaches the agent to use the Visual Memory MCP server to cache webpage and application screenshots, matching layout states and avoiding redundant LLM vision calls.
---

# Visual Memory (vision-memory-mcp)

This project utilizes `vision-memory-mcp` to cache visual states, record layout transitions, and avoid repetitive LLM vision calls.

### 1. Priority Order & Checklist
Whenever you capture a screenshot, examine a webpage, or need to verify a visual state, you MUST run this sequence:
1. **Orient**: Call `get_session_context` to load active transitions and recent visual states.
2. **Search (Optional)**: Call `recall_memory` to search past visual states by text query or image query.
3. **Ingest/Verify**: Call `analyze_screenshot` with the base64 screenshot before calling any vision LLMs.
4. **Cache Hit**: If `is_known` is `true`, read the returned `description` and do NOT call your vision LLM.
5. **Cache Miss**: If `is_known` is `false`, inspect the image with your vision model, summarize the layout, and register it back by calling `analyze_screenshot` with both the `screenshot` and `description` parameters.
6. **Log Transitions**: Right after taking any UI action (click, type, navigate, scroll), call `record_outcome` to build the navigation graph.
7. **Snapshotting**: Call `manage_snapshot` (`action: "save"`) when reaching milestones, and `manage_snapshot` (`action: "diff"`) to check for visual regressions.

### 2. Complete Tool Reference

| Tool Name | Key Inputs | Description |
|-----------|------------|-------------|
| `analyze_screenshot` | `screenshot`? (base64), `file_path`?, `description`?, `items`? | Main ingestion (single or batch) and visual state retrieval tool. |
| `recall_memory` | `query`?, `screenshot`?, `file_path`?, `strategy`?, `limit`? | Search visual memory by text query or image query (read-only). |
| `record_outcome` | `from_state_id`, `to_state_id`?, `action`, `action_type`? ('blocker' \| 'click' \| etc.) | Record UI action transitions or log visual blockers for state-memory. |
| `get_navigation_paths` | `from_state_id`?, `to_state_id`?, `to_description`?, `max_hops`? | Find historical path or instructions between states. |
| `predict_next_action` | `current_state_id`, `goal_description`?, `goal_state_id`? | Predict best next UI action and grounded element handles (`target_selector`, `target_coords`). |
| `compare_states` | `state_a_id` & `state_b_id` OR `video_a_id` & `video_b_id` | Compare two states visually (`has_layout_change`) or compare video runs. |
| `get_session_context` | `include_recent`?, `include_frequent`? | Get recent/frequent states, transition graphs, disk stats, cache metrics, and version info. |
| `manage_snapshot` | `action` ('save' \| 'diff' \| 'export' \| 'restore'), `name`?, `archive_json`? | Unified snapshot management for visual checkpoints and regression detection. |
| `manage_visual_spec` | `action` ('set' \| 'verify' \| 'list'), `name`?, `screenshot`?, `tolerance`? | Register and verify visual design contract baselines (Visual SDD). |
| `manage_video` | `action` ('ingest' \| 'search' \| 'timeline'), `file_path`?, `query`?, `video_id`? | Ingest WebM/MP4 recordings, search video keyframes, or retrieve timelines. |
| `create_evidence_pack` | `keyframe_state_ids`, `source_video_id`?, `linked_state_memory_nodes`? | Package immutable evidence packs linking video keyframes to state-memory DAGs. |
| `export_trajectories` | `format`? ('json' \| 'llava' \| 'qwen2_vl' \| 'joint'), `trace_id`? | Export multimodal trajectories for model fine-tuning or joint workflow exports. |
| `undo_visual_mutation` | `type`? ('state' \| 'transition' \| 'any') | Revert the last visual state ingestion or transition edge addition. |
| `forget_state` | `state_id` | Purge a specific state and vector embedding for privacy. |
| `wait_for_visual_state` | `target_state_id`, `timeout_ms`? | Poll for target visual state until present or timeout occurs. |

### 3. Agent Permissions & Auto-Run Configuration
To bypass confirmation dialogs when running CLI cache commands or reading/writing brain images, add these allows to your configuration:
* **Google Antigravity (`~/.gemini/config/config.json`)**: Add these rules to your `"globalPermissionGrants"` -> `"allow"` list:
  * `"command(vision-memory-mcp)"` (Allows running any query/ingest command prefix)
  * `"read_file(.*\\.gemini/antigravity/brain/.*)"` (Allows reading brain screenshots)
  * `"write_file(.*\\.gemini/antigravity/brain/.*)"` (Allows saving brain snapshots)

### 4. CLI Commands Reference
Run these commands in the terminal for management and analytics:
* `vision-memory-mcp init [-y|--yes]`: Scaffold workspace .vision-memory-mcp/, .gitignore, .env, and IDE agent rules.
* `vision-memory-mcp init-global`: Re-initialize across all projects registered in ~/.vision-memory-mcp/projects.json.
* `vision-memory-mcp doctor`: Health check storage writability, sharp bindings, Node runtime, and sub-directory Git repos.
* `vision-memory-mcp audit`: Audit sub-directory Git repos, submodules, database locations, and total visual states.
* `vision-memory-mcp inspect`: Display stored visual states in an ASCII table.
* `vision-memory-mcp metrics`: Calculate cache hit rate, token savings, and ROI.
* `vision-memory-mcp view`: Open an interactive force-directed graph visualizer in the browser.
* `vision-memory-mcp export --format [json\|mermaid\|html] --out [file]`: Export the memory graph.
* `vision-memory-mcp prune`: Purge expired or low-access states.
