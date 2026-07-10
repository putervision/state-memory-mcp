# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Initial release of `state-graph-mcp` workflow management Model Context Protocol (MCP) server.
- Support for task, decision, blocker, artifact, plan, and milestone node types.
- Automatic git history commit scanner engine.
- Static and tech stack scaffolder rules.
- 3D interactive HTML graph visualizer.
- Dependency tracing and critical path algorithms.
