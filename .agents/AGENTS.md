<!-- state-memory-mcp:start -->
# Workflow State Memory (state-memory-mcp)

This project uses `state-memory-mcp` with project slug `"state-memory-mcp"` to track tasks, decisions, blockers, and progress.
ALWAYS update the state graph when performing work.

## Mandatory Workflow
1. **Start of session**: Call `manage_sessions(action: "start", agent_id: "...")`, then run `get_analytics(action: "summary")` and `manage_tasks(action: "next")` BEFORE any coding.
2. **Before work**: Create or find the task node, set status to `in_progress`.
3. **During work**: Log decisions (`manage_nodes(action: "create", type: "decision")`), blockers (`manage_nodes(action: "create", type: "blocker")`), and notes (`manage_nodes(action: "add_note")`).
4. **Visual Consistency (Dual Memory)**:
   - For UI / layout tasks, capture visual evidence using `vision-memory-mcp:analyze_screenshot` (pass `trace_id: session_id` for joint trajectory correlation).
   - Link visual proof via `manage_edges(action: "link_visual", target_id: task_id, visual_state_id: vs_id, relationship: "renders_state")`.
   - Log visual blockers via `manage_edges(action: "link_visual", target_id: blocker_id, visual_state_id: vs_id, relationship: "blocked_by_visual_state")` or `vision-memory-mcp:record_outcome(action_type: "blocker")`.
5. **After work**: Run `run_diagnostics(action: "validate")`, set task status to `done` via `manage_tasks(action: "complete")`, create artifact nodes, and call `manage_sessions(action: "end")`.

## Tool Priority Order
1. `manage_sessions` — track all mutations under a unique session (`action: "start"`)
2. `get_analytics` — current state and progress (`action: "summary"`)
3. `manage_tasks` — query prioritized runnable tasks (`action: "next"`)
4. `manage_edges` — connect task/artifact nodes to visual states (`action: "link_visual"`)
5. `manage_tasks` — what's blocking progress (`action: "find_blockers"`)
6. `run_diagnostics` — check for cycle or logic anomalies (`action: "validate"`)
7. `manage_data` — export interleaved state + vision logs (`action: "export_joint_trajectories"`)

## Node Types
`task`, `decision`, `artifact`, `plan`, `milestone`, `blocker`, `observation`, `spec`, `requirement`, `acceptance_criterion`, `visual_state`

## Edge Types
`depends_on`, `blocks`, `produces`, `references`, `updates`, `contradicts`, `part_of`, `child_of`, `implements`, `decided_in`, `renders_state`, `blocked_by_visual_state`, `verifies_visual_state`

## Quick Reference
- **Batch updates**: `manage_nodes(action: "batch_update", ids: [...], status: "done")`
- **Quick notes**: `manage_nodes(action: "add_note", text: "...", attach_to: node_id)`
- **Synergy metrics**: `manage_data(action: "export_synergy_metrics")`
- **What changed**: `get_events(action: "changelog", since: "2h")` or `get_events(action: "changelog", session_id: "...")`

> For the complete tool reference and workflow patterns, see the `state-memory-mcp` skill in `.agents/skills/state-memory-mcp/SKILL.md`.
<!-- state-memory-mcp:end -->


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

<!-- webcrypt-mcp:start -->
# Cryptographic Vault & Security (webcrypt-mcp)

This project provides native `webcrypt-mcp` tooling for zero-dependency AES-256-GCM symmetric encryption, RSA-4096 hybrid public-key encryption, digital signatures, cryptographic hashes, and post-quantum cryptography.

## Mandatory Workflow
1. **Confidential Artifacts**: Whenever saving sensitive credentials, tokens, or private workflow states, encrypt them using `encrypt_payload(mode: "data", password: "...")` or `encrypt_payload(mode: "symmetric", password: "...")`.
2. **Key Management**: Use `manage_keys(action: "generate", type: "rsa" | "ecdh" | "hmac")` to generate cryptographically strong JWK-formatted keys for inter-agent communication.
3. **Integrity & Signatures**: Before completing tasks that produce verifiable evidence (such as evidence packs or release binaries), compute signatures or HMAC tags using `sign_verify(action: "sign", algorithm: "ECDSA" | "HMAC")`.
4. **Triple Memory Triad**:
   - `state-memory-mcp`: Workflow state tracking.
   - `vision-memory-mcp`: Visual state caching.
   - `webcrypt-mcp`: Local database vault encryption and evidence pack cryptographic signing.
<!-- webcrypt-mcp:end -->

<!-- world-model-mcp:start -->
## Spatial World Model (world-model-mcp)

This project uses `world-model-mcp` with project slug "state-memory-mcp" to maintain a persistent 3D/2D spatial internal world model, entity tracking, object permanence, and movement simulation.

### 1. Mandatory Workflow & Priority
1. **Orient & Explore**: Call `get_spatial_map(format: 'summary')` and `get_expected_view` at the start of spatial or simulated tasks.
2. **Entity Queries**: Use `query_entities` (FTS5 search, proximity radius, or entity_id lookup) before creating duplicate objects.
3. **Perception Bridging**:
   - Ingest detected objects from vision models using `ingest_observation`.
   - Reconcile expected vs observed visual state using `ingest_observation(reconcile: true)`.
4. **Spatial Relations**: Record topological containment, support, or proximity using `set_relation` (e.g. `on`, `inside`, `next_to`, `contains`).
5. **Action Simulation & Validation**: Before executing movement, call `simulate_movement` to verify path validity and avoid AABB obstacle collisions, or `simulate_movement(mode: 'navigate')` for waypoint planning.
6. **Goal Alignment**: Link target entities and destination regions to active `state-memory-mcp` tasks using `link_to_goal`.
7. **Action Outcomes**: Record movement success and entity mutations using `record_outcome`.

### 2. Tool Reference Summary (15 Core MCP Tools)
* `update_entity`: Create or update an entity (position, orientation, bounding box, properties, confidence).
* `query_entities`: Search entities by keyword, type, region, spatial proximity, tags, status, or lookup specific entity location/history.
* `set_relation`: Record/update spatial relationships (on, inside, next_to, above, below, near, contains).
* `get_spatial_map`: Export structured spatial layout, topological graph, 3D asset, or high-level summary.
* `simulate_movement`: Predict entity trajectory, test for AABB obstacle collisions, or compute navigation waypoints.
* `ingest_observation`: Merge perception detections into world model; re-identify entities and reconcile frustum view.
* `get_expected_view`: Calculate what entities should be visible from an observer pose and FOV cone.
* `link_to_goal`: Associate entities/regions with state-memory task IDs, or extract goal-relevant context slices.
* `record_outcome`: Update world model after action execution completes.
* `manage_spatial_spec`: Spatial SDD physical contract baseline registration, verification, and listing.
* `create_evidence_pack`: Generate cryptographic SHA-256 evidence packages linking spatial state to tasks.
* `use_spatial_blackboard`: Multi-agent shared spatial blackboard for publishing intentions and claiming mutex locks.
* `manage_snapshot`: Unified spatial snapshot and time-travel management (save, restore, diff, list, undo, history).
* `generate_game_inputs`: Generate Playwright MCP automation inputs or project/unproject 3D coordinates and screen pixels.
* `wait_for_spatial_state`: Poll and wait until an entity reaches a specific spatial condition.
<!-- world-model-mcp:end -->

<!-- behavior-mcp:start -->
# Behavior Runtime Engine (behavior-mcp)

This project uses `behavior-mcp` with project slug "state-memory-mcp" to execute deterministic behavior trees at ~60Hz in browser runtimes with reactive triggers and safety guardrails.

## Mandatory Runtime Workflow
1. **Load Behavior**: Call `load_behavior(action: "load", behavior_name: "...")` to activate execution.
2. **Monitor Execution**: Check `get_status(action: "current")` and inspect active node traversal paths.
3. **Reactive Triggers**: Register high-priority emergency interrupts via `register_trigger(action: "register", ...)`.
4. **Safety & Abort**: Call `abort_behavior(action: "abort")` to immediately halt execution if anomalous behavior occurs.

## 10 Core MCP Tools
- `load_behavior`: Inject and start behavior tree execution.
- `set_parameters`: Update execution parameters on the fly.
- `get_status`: Query active status, current node path, and tick counters.
- `abort_behavior`: Immediately halt, pause, or resume execution.
- `register_trigger`: Configure priority interrupts with cooldown guards.
- `replay_recording`: Capture and replay deterministic frame actions.
- `get_metrics`: Query execution telemetry and duration statistics.
- `manage_behaviors`: Register and version behavior tree definitions with SHA-256 tree hashes.
- `manage_blackboard`: Read and write behavior tree blackboard state variables.
- `manage_runtime_db`: Database maintenance, diagnostics, and SHA-256 Merkle audit verification.
<!-- behavior-mcp:end -->

<!-- agent-reasoning-mcp:start -->
# Strategic Agent Reasoning (agent-reasoning-mcp)

This project uses `agent-reasoning-mcp` with project slug "state-memory-mcp" to manage goals, decompose complex tasks, evaluate situational trade-offs, and track decision rationale.

## Mandatory Reasoning Workflow
1. **Start of planning**: Call `set_goal(action: "create", title: "...")` to establish high-level objectives.
2. **Decomposition**: Call `set_goal(action: "decompose", parent_id: "...", subgoals: [...])` to break down into actionable steps.
3. **Situational Trade-offs**: Call `evaluate_situation(action: "snapshot", snapshot: {...})` before selecting high-stakes actions.
4. **Utility Configuration**: Tune agent priorities with `set_utility_weights(action: "configure", weights: {...})`.
5. **Intention Dispatch**: Create execution directives with `manage_intentions(action: "create", ...)` for the runtime engine.
6. **Reactive Replanning**: If an unexpected blocker occurs, invoke `replan(action: "blocker", goal_id: "...", blocker_description: "...")`.

## 10 Core MCP Tools
- `set_goal`: Manage goal hierarchy and task DAGs.
- `evaluate_situation`: Score and rank candidate actions from environment snapshots.
- `replan`: Adaptively reconstruct subgoals upon obstacles.
- `assess_risk`: Quantitative threat and risk calculation.
- `query_knowledge`: Search heuristics and past decision patterns.
- `set_utility_weights`: Configure utility weights (aggression, caution, greed, exploration).
- `get_decision_trace`: Explainable chain-of-thought rationale playback.
- `manage_beliefs`: Structured belief state with exponential confidence decay.
- `manage_intentions`: Wire contract directives queue for runtime execution.
- `manage_reasoning_db`: Snapshots, diagnostics, and SHA-256 Merkle audit verification.
<!-- agent-reasoning-mcp:end -->

<!-- putervision-harness:start -->
# PuterVision MCP Cluster & Harness Rules

Active Supervised MCP Servers:
* `putervision-harness`: pv-harness start --project test_slug
* `state-memory-mcp`: state-memory-mcp --project test_slug
* `vision-memory-mcp`: vision-memory-mcp --project test_slug
* `world-model-mcp`: world-model-mcp --project test_slug
* `agent-reasoning-mcp`: agent-reasoning-mcp --project test_slug
* `behavior-mcp`: behavior-mcp --project test_slug
* `test-custom`: npx -y @org/test-custom

Always use `harness_start_loop` and supervise tasks via the PuterVision Harness.
<!-- putervision-harness:end -->
