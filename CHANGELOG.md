# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-07-10

### Added
- Phase 4: 7 New Agent-Facing Tools (bringing total tools to 44):
  - `batch_update`: Atomic batch updates of status, metadata, or tags.
  - `next_tasks`: Runnable task queue query, prioritized by downstream impact and age.
  - `what_changed`: Graph changeset diffing since a session start or timestamp.
  - `get_stale_nodes`: Staleness detector to find idle/untouched nodes.
  - `validate_graph`: Topological and logic validation (cycles, orphans, empty milestones).
  - `prune_events`: Event log pruning while preserving entity state.
  - `add_note`: Atomic observation notes with context links.
- Configurable backup directories default path setting via `allowedExportDirs`.

### Changed
- Phase 5: Code Decomposition & Architecture Modularization:
  - Decomposed massive `src/server.ts` handlers into clean, domain-specific handler files under `src/handlers/`.
  - Decomposed monolithic `src/engine/analytics.ts` into a structured module folder `src/engine/analytics/`.
  - Decomposed CLI commands from `src/cli.ts` into a clean subcommands architecture in `src/cli/commands/`.
- Phase 3 Performance Hardening:
  - Cached parsed TF-IDF tokens to optimize full-text search.
  - Paginated SQL execution and buffered event logging chunks.
- Phase 2 Bug Fixes & Stability:
  - Resolved circular dependency edge cases, session snapshot integrity, and CLI edge cases.
- Phase 1 Security Hardening:
  - Strict raw SQL query sanitization blocklist.
  - Strict path traversal validation on backup, restore, merge, and export inputs.

## [0.3.3] - 2026-07-10

### Added
- Integrated Interactive 3D Force-Directed Graph Visualizer screenshot into website (`docs/index.html`) and repository `README.md`.

## [0.3.2] - 2026-07-10

### Removed
- Legacy configuration and data migration code from the CLI `init` command.

## [0.3.1] - 2026-07-10

### Changed
- Project renamed from `state-graph-mcp` to `state-memory-mcp` across all files, docs, config templates, and environment variables.

## [0.3.0] - 2026-07-10

### Added
- Event-Sourced Audit Trail: Append-only `events` table logging all node/edge mutations with before/after state snapshots.
- Session Management: First-class `sessions` table tracking agent identities (`agent_id`) and session-scoped metadata.
- Persistent Context Snapshots: Save, list, and diff snapshots of the entire graph state over time to track project drift.
- State Rollback (`undo_last`): Revert the most recent mutation on a node by restoring `before_state` from the events ledger.
- Trajectory Export (`export_trajectories`): Export transition sequences in JSONL format for fine-tuning compiled local models.
- Added 9 new MCP tools (increasing total tool count from 28 to 37) and 2 new resource endpoints (`events`, `sessions`).
- Registered CLI subcommands for `sessions`, `events`, and `export-trajectories`.

### Changed
- Database Schema migration version 4 runs automatically on connection to configure new tables.
- Updated agent instruction templates with session tracking guidelines.
- Documentation and website enriched with academic-grade theoretical foundations (cognitive load theory, first-hop determinism, empirical latency stats).

## [0.2.1] - 2026-07-10

### Added
- Path traversal protection using `validatePath` checking backup, restore, and merge inputs against resolved project directories.
- Word boundary validation blocklist for raw SQL queries (`attach`, `pragma`, `readfile`, `writefile`, etc.) and read-only connection limits.
- Edge types `'extends'` and `'modifies'` to support comprehensive git commit trace mapping.
- Mapped database rows (`NodeRow`, `EdgeRow`) to eliminate `as any` type-casts and duplicate parsing logic across the entire engine.
- Dynamic project slug injection into IDE instructions and client configs during `init` CLI command.
- Graph export title/label character escaping for DOT and Mermaid diagrams to prevent syntax parsing crashes.
- Unhandled Exception and Rejection process handlers with graceful SQLite connection closing.
- Embedded suggestions block (`_suggestions`) directly in MCP node creation/update responses.

### Changed
- Refactored the `utils.ts` monolithic god file into domain modules (`backup.ts`, `import.ts`, `export.ts`, `audit.ts`, `merge.ts`, `query-raw.ts`).
- Replaced CLI shell-based browser launch commands (`open`/`start`/`xdg-open`) with safe `execFile` spawns.
- Simplified MCP tool routing switch-case in `server.ts` into a unified, mapping-based request runner reducing boilerplate by over 70%.
- Capped log level checks using cached process environment values at startup.

### Fixed
- Fixed typo in TF-IDF stop words set (`shanant` -> `shant`).
- Ensured SQLite execution errors during git commits scanning are logged instead of swallowed, preventing silent failures.

## [0.2.0] - 2026-07-08

### Added
- Initial release of `state-memory-mcp` workflow management Model Context Protocol (MCP) server.
- Support for task, decision, blocker, artifact, plan, and milestone node types.
- Automatic git history commit scanner engine.
- Static and tech stack scaffolder rules.
- 3D interactive HTML graph visualizer.
- Dependency tracing and critical path algorithms.
