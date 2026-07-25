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
7. **Snapshotting**: Call `save_visual_snapshot` when reaching milestones, and `diff_visual_snapshots` to check for visual regressions.

### 2. Complete Tool Reference

| Tool Name | Key Inputs | Description |
|-----------|------------|-------------|
| `analyze_screenshot` | `screenshot` (base64), `description`?, `accessibility_tree`?, `tags`?, `force_refresh`? | Main ingestion and visual state retrieval tool. |
| `recall_memory` | `query`?, `screenshot`?, `strategy`?, `limit`?, `include_transitions`? | Search visual memory by text query or image query. |
| `record_outcome` | `from_state_id`, `to_state_id`?, `to_screenshot`?, `action`, `success`, `notes`? | Record UI action outcomes to build the navigation graph. |
| `get_navigation_paths` | `from_state_id`?, `to_state_id`?, `to_description`?, `max_hops`? | Find historical path or instructions between states. |
| `compare_states` | `state_a_id`, `state_b_id` | Compare two states visually (hash distance) and semantically. |
| `get_session_context` | `include_recent`?, `include_frequent`? | Get recent/frequent states and current database statistics. |
| `save_visual_snapshot` | `name`, `description`? | Save current visual memory states as a named checkpoint. |
| `diff_visual_snapshots` | `snapshot_a_name`, `snapshot_b_name` | Compare two checkpoints to detect additions or visual regressions. |
| `undo_last_visual_mutation` | `type`? ('state' \| 'transition' \| 'any') | Revert the last state ingestion or transition edge addition. |

### 3. Agent Permissions & Auto-Run Configuration
To bypass confirmation dialogs when running CLI cache commands or reading/writing brain images, add these allows to your configuration:
* **Google Antigravity (`~/.gemini/config/config.json`)**: Add these rules to your `"globalPermissionGrants"` -> `"allow"` list:
  * `"command(vision-memory-mcp)"` (Allows running any query/ingest command prefix)
  * `"read_file(.*\\.gemini/antigravity/brain/.*)"` (Allows reading brain screenshots)
  * `"write_file(.*\\.gemini/antigravity/brain/.*)"` (Allows saving brain snapshots)

### 4. CLI Commands Reference
Run these commands in the terminal for management and analytics:
* `vision-memory-mcp doctor`: Health check storage writability, sharp bindings, Node runtime, and sub-directory Git repos.
* `vision-memory-mcp audit`: Audit sub-directory Git repos, submodules, database locations, and total visual states.
* `vision-memory-mcp inspect`: Display stored visual states in an ASCII table.
* `vision-memory-mcp metrics`: Calculate cache hit rate, token savings, and ROI.
* `vision-memory-mcp view`: Open an interactive force-directed graph visualizer in the browser.
* `vision-memory-mcp export --format [json\|mermaid\|html] --out [file]`: Export the memory graph.
* `vision-memory-mcp prune`: Purge expired or low-access states.
