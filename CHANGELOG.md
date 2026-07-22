# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.6] - 2026-07-21

### Fixed & Improved
- Published npm package under `@putervision` organization scope: `@putervision/state-memory-mcp`.
- Updated project author to PuterVision LLC and set project homepage link to `https://putervision.com`.
- Updated all repository, issues, homepage, and documentation links to point to `https://github.com/putervision/state-memory-mcp`.
- Standardized installation instructions to `npm install -g @putervision/state-memory-mcp` across all documentation, website, and CLI templates.
- Standardized website feature card layouts and icons with `<h3><span>icon</span> Title</h3>` structure and glassmorphism styling.
- Enhanced website SEO with comprehensive meta tags, OpenGraph previews, Twitter cards, canonical URL link, SVG favicon, and Schema.org `SoftwareApplication` JSON-LD structured data.
- Incremented package and website release versions to `v0.4.6`.

## [0.4.5] - 2026-07-16

### Added
- Added `renders_state` edge type to support integration with visual memory.
- Added `unverified_ui` validation check in `validate_graph` tool to verify that all completed UI tasks have associated visual verification metadata or `renders_state` edges.

### Fixed
- Hardened test suite global registry mocking to prevent JSON parse warning during test runs.
- Resolved ESLint warnings (prefer-const, no-empty catch blocks, and unused import).

## [0.4.4] - 2026-07-14

### Fixed
- Internal build stabilization and dependency updates.

## [0.4.3] - 2026-07-13

### Fixed
- Prevented stdio MCP transport corruption on server startup by redirecting all `console.log` statements inside `runAutoInit` to `console.error` (stderr).

## [0.4.2] - 2026-07-13

### Added
- Auto-initialization check on server start: When launched as an MCP server, `state-memory-mcp` automatically performs a silent, lightweight configuration audit of instruction files, global and local configs, rules, and customizations to ensure they are up to date with the latest templates.
- Overwrite capability for `.agents/skills/state-memory-mcp/SKILL.md` to guarantee the agent has the correct matching tool reference on version update.

## [0.4.1] - 2026-07-13

### Added
- `state-memory-mcp init` now scaffolds the global Google Antigravity (Gemini) MCP config (`~/.gemini/config/mcp_config.json`), creating or merging the `state-memory-mcp` server entry automatically.
- `state-memory-mcp init` now creates workspace-level agent customizations:
  - `.agents/AGENTS.md` — Concise mandatory workflow rules and tool priority order for AI agents.
  - `.agents/skills/state-memory-mcp/SKILL.md` — Comprehensive agent skill reference covering all 44 tools, node/edge types, workflow patterns, and CLI commands.
- New template functions: `getMcpConfigAntigravity()`, `getSkillTemplate()`, `getAgentsMdTemplate()`.

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
