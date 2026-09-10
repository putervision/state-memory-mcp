---
name: agent-reasoning-mcp
description: Teaches the agent to use the Strategic Agent Reasoning MCP server for BDI goals, utility scoring, risk evaluation, and replanning.
---

# Strategic Agent Reasoning (agent-reasoning-mcp)

This skill provides step-by-step guidance and operational patterns for interacting with `@putervision/agent-reasoning-mcp` with project slug `"state-memory-mcp"`.

---

## 1. Role in the PuterVision Pentad
- **Workflow State** (`state-memory-mcp`): Persistent task DAGs, decisions, milestones, and blockers.
- **Perception** (`vision-memory-mcp`): Visual layout caching, screenshots, and visual specifications.
- **Spatial World** (`world-model-mcp`): Persistent 3D/2D coordinates, bounding boxes, and topological relations.
- **Strategic Reasoning** (`agent-reasoning-mcp`): BDI goal decomposition, multi-attribute expected utility calculation, belief decay, risk assessment, and replanning.
- **Tactical Execution** (`behavior-mcp`): Deterministic ~60Hz browser behavior tree execution and reactive preemption.

---

## 2. Core Operational Sequence
1. **Initialize Objectives**: Call `set_goal` with `action: "create"` to define top-level goals and `action: "decompose"` to establish subgoals.
2. **Configure Utility Profile**: Tune agent priorities using `set_utility_weights` (aggression, caution, greed, exploration).
3. **Situational Trade-off Scoring**: Call `evaluate_situation` with `action: "snapshot"` to rank candidate actions using Pareto utility theory.
4. **Intention Dispatch**: Translate chosen action into an execution directive via `manage_intentions`.
5. **Reactive Replanning**: If an unexpected obstacle or blocker emerges, invoke `replan`.

---

## 3. Complete 10 Consolidated MCP Tools Reference

| Tool Name | Key Actions | Key Parameters | Description |
|---|---|---|---|
| `set_goal` | `create`, `update`, `get`, `list`, `decompose`, `archive` | `title`, `description`, `priority`, `parent_id`, `subgoals` | Hierarchical BDI goal management and task DAG decomposition. |
| `evaluate_situation` | `snapshot`, `quick` | `snapshot`, `candidates`, `utility_profile` | Multi-attribute utility evaluation ranking candidate actions from environment state. |
| `replan` | `blocker`, `recovery`, `alternative` | `goal_id`, `blocker_description`, `strategy` | Adaptive DAG reconstruction and alternative path discovery upon obstacles. |
| `assess_risk` | `assess`, `matrix` | `hazards`, `tolerance`, `mitigations` | Quantitative threat matrix and probabilistic risk scoring. |
| `query_knowledge` | `search`, `lookup`, `heuristics` | `query`, `category`, `tags` | Knowledge retrieval of past decision heuristics and domain heuristics. |
| `set_utility_weights` | `configure`, `get`, `list`, `profile` | `name`, `weights` (aggression, caution, greed, exploration) | Utility weight tuning and personality profile management. |
| `get_decision_trace` | `get`, `list`, `explain` | `trace_id`, `limit` | Explainable chain-of-thought rationale playback and auditing. |
| `manage_beliefs` | `set`, `get`, `decay`, `list` | `key`, `value`, `confidence`, `decay_rate` | Structured belief state with temporal exponential confidence decay. |
| `manage_intentions` | `create`, `get`, `list`, `dispatch`, `cancel` | `goal_id`, `behavior_name`, `parameters` | Execution directives queue connecting strategic plans to runtime engines. |
| `manage_reasoning_db` | `stats`, `audit`, `snapshot`, `restore`, `prune` | `action`, `name`, `description` | Database diagnostics, snapshots, and SHA-256 Merkle audit verification. |
