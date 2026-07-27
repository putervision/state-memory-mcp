# State-Memory-MCP Database Schema Reference

> **Database Engine**: SQLite 3 (via `better-sqlite3`)  
> **Storage Mode**: WAL (Write-Ahead Logging), Foreign Keys Enabled, Synchronous Normal

`state-memory-mcp` persists project state locally inside `.state-memory-mcp/<project-slug>/graph.db` or globally in `~/.state-memory-mcp/data/<project-slug>/graph.db`.

---

## Tables Overview

### 1. `nodes` Table
Stores graph nodes representing workflow entities (`task`, `decision`, `artifact`, `plan`, `milestone`, `blocker`, `observation`).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `TEXT` | `PRIMARY KEY` | Unique ULID identifier (26 chars) |
| `type` | `TEXT` | `NOT NULL` | Node entity type (`task`, `decision`, `artifact`, `plan`, `milestone`, `blocker`, `observation`) |
| `title` | `TEXT` | `NOT NULL` | Short human-readable title/label |
| `status` | `TEXT` | `NOT NULL` | Status string (`pending`, `in_progress`, `done`, `blocked`, `cancelled`, `accepted`, `draft`, `current`) |
| `project` | `TEXT` | `NOT NULL` | Sanitized project slug |
| `git_branch` | `TEXT` | `DEFAULT 'main'` | Git branch where node was created/last updated |
| `metadata` | `TEXT` | `NOT NULL DEFAULT '{}'` | JSON object for type-specific properties |
| `tags` | `TEXT` | `NOT NULL DEFAULT '[]'` | JSON array of string tags |
| `created_at` | `TEXT` | `NOT NULL` | ISO 8601 UTC creation timestamp |
| `updated_at` | `TEXT` | `NOT NULL` | ISO 8601 UTC last update timestamp |

#### Indexes:
- `idx_nodes_project_type_status` ON `nodes(project, type, status)`
- `idx_nodes_project_branch` ON `nodes(project, git_branch)`
- `idx_nodes_created_at` ON `nodes(created_at DESC)`

---

### 2. `edges` Table
Stores directed relationships connecting nodes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `TEXT` | `PRIMARY KEY` | Unique ULID identifier |
| `source_id` | `TEXT` | `NOT NULL, REFERENCES nodes(id) ON DELETE CASCADE` | Source node ID |
| `target_id` | `TEXT` | `NOT NULL, REFERENCES nodes(id) ON DELETE CASCADE` | Target node ID |
| `type` | `TEXT` | `NOT NULL` | Relationship type (`depends_on`, `blocks`, `produces`, `references`, `updates`, `contradicts`, `part_of`, `child_of`, `implements`, `decided_in`, `renders_state`) |
| `properties` | `TEXT` | `NOT NULL DEFAULT '{}'` | JSON object for edge metadata |
| `project` | `TEXT` | `NOT NULL` | Sanitized project slug |
| `git_branch` | `TEXT` | `DEFAULT 'main'` | Git branch where edge was created |
| `created_at` | `TEXT` | `NOT NULL` | ISO 8601 UTC creation timestamp |

#### Indexes:
- `idx_edges_source_target` ON `edges(source_id, target_id)`
- `idx_edges_project_type` ON `edges(project, type)`

---

### 3. `events` Table
Append-only event sourcing audit ledger logging every node and edge mutation.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `TEXT` | `PRIMARY KEY` | Unique ULID identifier |
| `session_id` | `TEXT` | `REFERENCES sessions(id) ON DELETE SET NULL` | Session ID associated with mutation |
| `event_type` | `TEXT` | `NOT NULL` | Type of event (`node_created`, `node_updated`, `node_deleted`, `edge_created`, `edge_deleted`) |
| `entity_type` | `TEXT` | `NOT NULL` | Entity type (`node` or `edge`) |
| `entity_id` | `TEXT` | `NOT NULL` | ID of created/updated/deleted entity |
| `before_state` | `TEXT` | `NULL` | JSON string of entity before mutation |
| `after_state` | `TEXT` | `NULL` | JSON string of entity after mutation |
| `project` | `TEXT` | `NOT NULL` | Project slug |
| `timestamp` | `TEXT` | `NOT NULL` | ISO 8601 UTC timestamp |
| `metadata` | `TEXT` | `NOT NULL DEFAULT '{}'` | Additional event provenance metadata |

#### Indexes:
- `idx_events_project_timestamp` ON `events(project, timestamp DESC)`
- `idx_events_entity` ON `events(entity_id)`
- `idx_events_session` ON `events(session_id)`

---

### 4. `sessions` Table
Tracks active and concluded agent sessions with identity provenance.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `TEXT` | `PRIMARY KEY` | Unique ULID session identifier |
| `agent_id` | `TEXT` | `NOT NULL` | Agent identifier (e.g., `claude-code`, `antigravity`, `user`) |
| `project` | `TEXT` | `NOT NULL` | Project slug |
| `started_at` | `TEXT` | `NOT NULL` | ISO 8601 UTC session start timestamp |
| `ended_at` | `TEXT` | `NULL` | ISO 8601 UTC session end timestamp (NULL if active) |
| `metadata` | `TEXT` | `NOT NULL DEFAULT '{}'` | Custom session metadata |

#### Indexes:
- `idx_sessions_project_started` ON `sessions(project, started_at DESC)`

---

### 5. `snapshots` Table
Context checkpoints containing serialized graph state blobs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `TEXT` | `PRIMARY KEY` | Unique ULID snapshot identifier |
| `project` | `TEXT` | `NOT NULL` | Project slug |
| `session_id` | `TEXT` | `NULL` | Session ID during snapshot creation |
| `snapshot` | `TEXT` | `NOT NULL` | JSON string `{ nodes: [...], edges: [...] }` |
| `node_count` | `INTEGER` | `NOT NULL` | Total node count in snapshot |
| `edge_count` | `INTEGER` | `NOT NULL` | Total edge count in snapshot |
| `created_at` | `TEXT` | `NOT NULL` | ISO 8601 UTC creation timestamp |

---

### 6. `nodes_fts` Virtual Table (SQLite FTS5)
Full-Text Search index over node `title`, `metadata`, and `tags`.

#### Columns:
- `title`
- `metadata`
- `tags`

Automatically kept in sync with `nodes` via SQLite triggers:
- `nodes_ai` (AFTER INSERT)
- `nodes_ad` (AFTER DELETE)
- `nodes_au` (AFTER UPDATE)

---

### 7. `schema_meta` Table
Tracks database schema migration versions, migration timestamps, and integrity metadata.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `key` | `TEXT` | `PRIMARY KEY` | Metadata property key (e.g. `version`) |
| `value` | `TEXT` | `NOT NULL` | Metadata property value (e.g. `9`) |
| `updated_at` | `TEXT` | `NOT NULL` | ISO 8601 UTC update timestamp |

---

## Disclaimer & Limitation of Liability

This software is provided "as is", without warranty of any kind, express or implied. Under no circumstances shall the authors or contributors be liable for any database corruption, Git repository modification, data loss, or other issues resulting from execution. Always backup your database files before performing destructive operations.
