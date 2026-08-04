# Session & Event Tracking, Snapshots, Trajectories & Spec-Driven Development

`state-memory-mcp` provides full session management, change logging, state rollback, context snapshots, trajectory exports, sub-directory support, and Spec-Driven Development (SDD).

---

## 📋 Session Lifecycle

Track concurrent agents or sequential tasks using tracked sessions. Starting a session returns a `session_id` that stamps all subsequent graph mutations:
* `start_session`: Start a session with an optional `agent_id` (e.g. `claude-coder`, `gemini-tester`) and custom metadata.
* `end_session`: Conclude the session and log completion.
* `list_sessions`: List active and completed sessions.

---

## 📜 Event-Sourced Audit Trail

All mutations to nodes and edges are recorded in an append-only `events` ledger.
* `get_event_log`: Query events in the project with filters.
* `get_node_history`: View every update, creation, or deletion event for a specific node in chronological order.
* `undo_last`: Revert the last recorded change on a node by restoring its `before_state` or deleting a newly created node.

---

## 💾 Context Snapshots & Diffing

* `save_snapshot`: Save the current graph structure (all nodes and edges) as a named context checkpoint.
* `list_snapshots`: View historical checkpoints.
* `diff_snapshots`: Compare any two checkpoints. Returns exactly which nodes were added, removed, updated, or had their status changed, plus any added/removed edge relationships.

---

## 📈 Trajectory Export for Model Training

* `export_trajectories`: Export the chronological transition log of a project in JSONL format, providing clean training data to fine-tune smaller local models on standard operating procedures.

---

## 📂 Sub-Directory & Mono-Repo Support

* **Multi-Repo Git Health Accounting**: `state-memory-mcp doctor` discovers and checks root and nested Git repositories across sub-directories up to depth 4, reporting active branches and clean/dirty state.
* **Sub-Directory Memory Observation**: Memory query tools (`list_nodes`, `search_nodes`) and health auditing (`audit`, `audit_project_db`, `doctor`) observe and audit nested `.state-memory-mcp` databases in sub-directories (`include_subdirectories: true`), annotating nodes with sub-project origin tags (`subproject: <slug>`).

---

## 📑 Spec-Driven Development (SDD) & Ingestion

* **Graph-Native Specifications**: Dedicated node types (`spec`, `requirement`, `acceptance_criterion`, `contract`) and SDD edge relationships (`satisfies`, `verifies`, `specifies`, `violates`, `drifts_from`).
* `ingest_spec` / `state-memory-mcp spec:ingest <file>`: Parse and ingest Markdown PRDs, OpenSpec files, or Gherkin (`.feature`) BDD files directly into memory graph nodes.
* `export_spec` / `state-memory-mcp spec:export <specId>`: Export graph-managed specs and child requirements back out to Markdown or Gherkin text.
* `get_spec_compliance` / `state-memory-mcp spec:matrix`: Calculate real-time Spec Compliance matrix and requirement coverage ratio.
* `scaffold_spec`: Scaffold standard feature specification templates in `.specs/`.
* `verify_requirement`: Mark acceptance criteria as verified, failing, or skipped, optionally linking test observations.
* **Git Spec Staleness**: Automatically detects modifications to `.specs/` or `docs/specs/` files in Git commits and flags graph spec nodes as `stale`.
