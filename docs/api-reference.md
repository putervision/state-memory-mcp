# 📘 @putervision/state-memory-mcp Formal API Reference & Leveraged Usage Guide (v0.6.6)

This document provides formal API specifications, parameter schemas, return shapes, JSON payloads, and practical leverage descriptions for all 58 Model Context Protocol (MCP) tools provided by `@putervision/state-memory-mcp`.

---

## 1. Session & Project Administration

### `start_session`
- **Overview**: Initiates a new isolated session ledger for tracking agent actions.
- **How to Leverage**: Call this tool at the very beginning of a complex prompt or multi-agent run. It isolates mutations so that if an agent run fails or needs auditing, all node and edge creations/updates can be filtered, tracked, or rolled back by `session_id`.
- **Request Payload**:
```json
{
  "project": "my-app",
  "agent_id": "cursor-agent-01",
  "metadata": { "workflow": "auth-refactor", "branch": "feature/oauth" }
}
```
- **Response Payload**:
```json
{
  "session_id": "sess_01KYBJ0RWJ8V",
  "project": "my-app",
  "status": "started",
  "timestamp": "2026-07-25T03:54:00.000Z"
}
```

### `end_session`
- **Overview**: Closes an active agent session ledger.
- **How to Leverage**: Call upon finishing a task or when delegating to another subagent. It records total execution duration and marks the session lifecycle as complete in the audit log.
- **Request Payload**:
```json
{
  "session_id": "sess_01KYBJ0RWJ8V",
  "project": "my-app"
}
```

### `get_project_summary`
- **Overview**: Returns high-level project metrics, task counts, progress %, and open blockers.
- **How to Leverage**: Leverage as the primary "first turn" context prompt tool. Instead of reading hundreds of files to figure out project status, calling `get_project_summary` instantly delivers completed vs pending tasks, current velocity, and blocking issues in under 5ms.
- **Request Payload**:
```json
{ "project": "my-app" }
```
- **Response Payload**:
```json
{
  "project": "my-app",
  "total_nodes": 42,
  "active_tasks": 5,
  "completed_tasks": 31,
  "progress_pct": 73.8,
  "blockers_count": 1,
  "formatted_summary": "Project my-app: 31/42 tasks completed (73.8%). 1 active blocker."
}
```

---

## 2. Task & Node Mutations

### `add_node`
- **Overview**: Creates a new node in the state graph.
- **How to Leverage**: Leverage when planning a feature or recording an architectural decision. Create `task` nodes for actionable code work, `decision` nodes for technical choices (e.g., choosing a database), `blocker` nodes when stuck, and `artifact` nodes for generated files.
- **Request Payload**:
```json
{
  "project": "my-app",
  "type": "decision",
  "title": "Use Argon2id for password hashing",
  "description": "Selected Argon2id over bcrypt for memory-hard key derivation compliance.",
  "status": "done",
  "tags": ["security", "auth"]
}
```

### `update_node`
- **Overview**: Updates node properties or status.
- **How to Leverage**: Use to transition task statuses (`pending` -> `in_progress` -> `done`). When an agent finishes a task, calling `update_node(status: "done")` automatically unblocks downstream dependent tasks.
- **Request Payload**:
```json
{
  "project": "my-app",
  "id": "task_auth_01",
  "status": "done"
}
```

### `add_edge`
- **Overview**: Links two nodes with a directional relationship.
- **How to Leverage**: Build explicit dependency subgraphs (e.g. `task_B depends_on task_A` or `blocker_X blocks task_C`). The server automatically rejects circular loops, maintaining a strict Directed Acyclic Graph (DAG).
- **Request Payload**:
```json
{
  "project": "my-app",
  "source_id": "blocker_db_01",
  "target_id": "task_auth_01",
  "type": "blocks"
}
```

---

## 3. Graph Traversal & Analysis

### `next_tasks`
- **Overview**: Queries top prioritized, unblocked, runnable tasks.
- **How to Leverage**: Leverage in autonomous loop execution scripts. Instead of asking the user "what should I do next?", the agent calls `next_tasks` to retrieve the exact set of tasks whose dependencies are 100% satisfied.
- **Request Payload**:
```json
{
  "project": "my-app",
  "limit": 3,
  "include_context": true
}
```

### `get_cognitive_load`
- **Overview**: Calculates Intrinsic ($ICL$) and Extraneous ($ECL$) cognitive load metrics.
- **How to Leverage**: Leverage to audit prompt context bloat. Drives Extraneous Cognitive Load ($ECL$) to near zero by offloading unneeded task definitions into local SQLite.
- **Request Payload**:
```json
{ "project": "my-app" }
```
- **Response Payload**:
```json
{
  "project": "my-app",
  "metrics": {
    "intrinsic_cognitive_load_ICL": 14.5,
    "extraneous_cognitive_load_ECL": 2.0,
    "total_cognitive_load_CL": 16.5
  },
  "summary": "Active cognitive load: ICL = 14.5, ECL = 2.0. Extraneous load offloaded to SQLite."
}
```

### `traceback_to_node`
- **Overview**: Resets task execution state back to a prior validated node when test/verification fails.
- **How to Leverage**: When a test or build fails unexpectedly, call `traceback_to_node(target_node_id: "task_schema_01")` to cleanly reset active task execution back to a known working state, avoiding hallucinated recovery loops inside a corrupted prompt.
- **Request Payload**:
```json
{
  "project": "my-app",
  "target_node_id": "task_schema_01",
  "reason": "Integration test failed on migration script."
}
```

---

## 4. Event Sourcing & Cryptographic Auditing

### `verify_audit_chain`
- **Overview**: Verifies SHA-256 event audit hash chain integrity ($H_n = \text{SHA-256}(H_{n-1} \parallel \text{event}_n)$).
- **How to Leverage**: Leverage in CI/CD pre-commit hooks or compliance audits (e.g. EU AI Act). Ensures no human or malicious subagent manually edited or deleted historical event logs.
- **Request Payload**:
```json
{ "project": "my-app" }
```
- **Response Payload**:
```json
{
  "valid": true,
  "total_events": 148,
  "message": "Cryptographic audit chain verified: 148 hashed events intact."
}
```

### `subscribe_context_changes`
- **Overview**: Registers CA-MCP Shared Context Store reactor triggers.
- **How to Leverage**: Enables $N_{\text{LLM}} = 2$ multi-agent orchestration. Specialized worker agents subscribe to state changes and react asynchronously without invoking central LLM turns.
- **Request Payload**:
```json
{
  "project": "my-app",
  "since_event_id": 120
}
```
