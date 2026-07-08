# state-graph-mcp — Build Plan

> **Version**: 0.1 (Draft)
> **Date**: 2026-07-07
> **Author**: Architecture Review

---

## 1. Overall Vision & Positioning

### Vision Statement

**state-graph-mcp** is a zero-infrastructure, deterministic MCP server that gives AI agents a structured, persistent graph for tracking workflow state — tasks, decisions, artifacts, plans, blockers, and their rich interconnections. Where codebase-memory-mcp provides agents with *structural awareness of code*, state-graph-mcp provides *structural awareness of work*: what was decided, why, what depends on what, and what's blocking progress. No LLM in the loop; the calling agent decides what to store and what to query. The graph is the single source of truth for project state.

### How It Differs From Existing Solutions

| Concern | Existing Memory MCPs | state-graph-mcp |
|---|---|---|
| **Focus** | Facts, knowledge, code structure | Workflow: tasks, decisions, rationale, dependencies |
| **Schema** | Generic entity–relation or code-specific (functions, classes) | Purpose-built node types: Task, Decision, Plan, Blocker, Milestone, Artifact, Observation |
| **Relationships** | Generic "relates_to" | Semantic edges: `depends_on`, `blocks`, `produces`, `decided_in`, `contradicts`, `part_of`, `updates` |
| **Query model** | Keyword/vector search | Structural + analytical: critical path, impact analysis, decision trails, blocker chains |
| **LLM dependency** | Some use LLMs for extraction | Fully deterministic — agent provides structured input |
| **Persistence** | Mixed (some in-memory) | SQLite file on disk, survives restarts, portable |

### Target Users & Primary Use Cases

**Target users**: AI coding agents (Claude Code, Cursor, Copilot, Gemini CLI) and the developers who orchestrate them.

**Primary use cases**:
1. **Long-running project tracking** — Agent maintains a task graph across sessions; resumes work by querying `get_active_tasks` instead of re-reading all context.
2. **Decision auditing** — Every architectural/design decision is stored with rationale, alternatives considered, and links to the tasks that motivated it.
3. **Dependency & blocker analysis** — "What's blocking the auth refactor?" becomes a graph traversal, not a prompt archaeology exercise.
4. **Plan decomposition** — Hierarchical plans with milestones, sub-tasks, and progress tracking.
5. **Contradiction detection** — Surface when a new decision contradicts an earlier one (via `contradicts` edges).
6. **Handoff context** — When switching agents or sessions, the graph provides a structured summary rather than dumping raw conversation history.

### Complementary Coexistence with Codebase Memory MCPs

Rather than replacing code-specific memory tools (such as codebase-memory-mcp), **state-graph-mcp** operates on a higher conceptual level. Agents reference the same entities across both graphs:
- An **Artifact** node in `state-graph-mcp` representing a source file (e.g., `src/auth.ts`) references the file path, which can then be parsed and queried structurally in `codebase-memory-mcp`.
- A **Decision** node in `state-graph-mcp` can link directly to a specific function's `qualified_name` (e.g., `pkg/auth.AuthenticateUser`) inside its metadata to explain the architectural reason why that function was designed a certain way.
- Agents use both tools in tandem: `codebase-memory-mcp` tells the agent *how the code is structured today*, and `state-graph-mcp` explains *why it was built that way, what tasks remain, and what is currently blocking progress*.

---

## 2. Recommended Architecture

### Core Tech Stack

| Component | Choice | Rationale |
|---|---|---|
| **Language** | TypeScript (ESM) | MCP SDK is TypeScript-native (`@modelcontextprotocol/sdk`); fastest path to a working server; excellent npm distribution story; broad contributor base. |
| **Graph storage** | SQLite via `better-sqlite3` | Zero infrastructure (no Docker, no external DB); synchronous in-process queries (ideal for stdio MCP); file-based persistence; proven pattern from codebase-memory-mcp. WAL mode gives good read/write concurrency. |
| **MCP SDK** | `@modelcontextprotocol/sdk` (latest) | Official SDK; `StdioServerTransport`; first-class `zod` validation. |
| **Schema validation** | `zod` | Required by the MCP SDK for tool parameter schemas; also used for internal data validation. |
| **Build** | `tsup` (esbuild-based) | Fast bundling; produces a single CJS/ESM entry point; tree-shakes well. |
| **Testing** | `vitest` | Fast, TypeScript-native, excellent DX, watch mode. |
| **CLI** | `commander` | Lightweight CLI framework for optional non-MCP usage (init, inspect, export). |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                  MCP Client (Agent)                 │
│         (Claude Code / Cursor / Copilot)            │
└──────────────────────┬──────────────────────────────┘
                       │ stdio (JSON-RPC)
┌──────────────────────▼──────────────────────────────┐
│              state-graph-mcp Server                 │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  MCP Layer  │  │  Tool Router │  │  Zod       │ │
│  │  (SDK)      │──│  & Handlers  │──│  Schemas   │ │
│  └─────────────┘  └──────┬───────┘  └────────────┘ │
│                          │                          │
│  ┌───────────────────────▼────────────────────────┐ │
│  │              Graph Engine                      │ │
│  │                                                │ │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ │ │
│  │  │ Node Ops   │ │ Edge Ops   │ │ Query Ops  │ │ │
│  │  │ (CRUD)     │ │ (CRUD)     │ │ (Analytical│ │ │
│  │  └────────────┘ └────────────┘ │  Traversal)│ │ │
│  │                                └────────────┘ │ │
│  └───────────────────────┬────────────────────────┘ │
│                          │                          │
│  ┌───────────────────────▼────────────────────────┐ │
│  │           SQLite (better-sqlite3)              │ │
│  │                                                │ │
│  │  ┌──────┐  ┌──────┐  ┌──────┐  ┌───────────┐ │ │
│  │  │nodes │  │edges │  │props │  │ migrations│ │ │
│  │  └──────┘  └──────┘  └──────┘  └───────────┘ │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  📁 ~/.state-graph-mcp/<project>/graph.db           │
└─────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

1. **SQLite over Neo4j/Kuzu/Memgraph**: Zero infrastructure is non-negotiable for a developer tool. Agents should not need Docker running to track tasks. SQLite handles the expected scale (hundreds to low thousands of nodes per project) with sub-millisecond query times. Recursive CTEs provide sufficient graph traversal capability.

2. **No LLM in the engine**: The server is a pure data store + query engine. The calling agent is responsible for deciding what to store and how to interpret results. This makes the server deterministic, testable, and fast.

3. **Project-scoped databases**: Each project gets its own `graph.db` file (stored in `~/.state-graph-mcp/<project-slug>/graph.db`). This keeps graphs isolated, portable, and easy to back up or delete. The project is identified by a name provided by the agent; the server implements a root-resolution strategy (searching for `.git` or `.state-graph`) to ensure consistent project slugs regardless of the current working directory.

4. **Hybrid native consideration**: The initial version is pure TypeScript. If performance becomes a concern at scale, the SQLite layer could be swapped for a Rust/Go native binary (as codebase-memory-mcp does), with the npm package acting as a thin wrapper. The architecture is designed to make this swap possible by keeping the graph engine behind a clean interface.

5. **Multi-Agent Concurrency & Locking**: Multiple subagents or background tasks might access the database concurrently. We mitigate SQLite write locking by using WAL mode (`PRAGMA journal_mode = WAL`), configuring a busy timeout of 5000ms (`PRAGMA busy_timeout = 5000`), and keeping write transactions extremely brief and synchronous.

---

## 3. Data Model / Schema

### Node Types

All nodes share a common base:

```typescript
interface BaseNode {
  id: string;           // ULID (sortable, unique, no coordination)
  type: NodeType;       // Discriminator
  title: string;        // Human-readable label
  status: string;       // Type-specific status enum
  created_at: string;   // ISO 8601
  updated_at: string;   // ISO 8601
  metadata: Record<string, unknown>; // Extensible JSON blob
  tags: string[];       // Freeform tags for filtering
  project: string;      // Project scope
  git_branch?: string;  // Optional branch name for context isolation
}
```

| Node Type | Status Values | Key Properties |
|---|---|---|
| **Task** | `pending`, `in_progress`, `done`, `blocked`, `cancelled` | `priority` (p0–p3), `assignee`, `description`, `estimate` |
| **Decision** | `proposed`, `accepted`, `rejected`, `superseded` | `rationale`, `alternatives` (JSON array), `confidence` (high/medium/low) |
| **Artifact** | `draft`, `current`, `outdated`, `archived` | `artifact_type` (file, plan, doc, config), `path`, `content_hash` |
| **Plan** | `draft`, `active`, `completed`, `abandoned` | `description`, `goal`, `scope` |
| **Observation** | `active`, `resolved`, `invalidated` | `source`, `severity` (info/warning/critical), `content` |
| **Blocker** | `active`, `mitigated`, `resolved` | `severity`, `impact`, `resolution` |
| **Milestone** | `upcoming`, `in_progress`, `reached`, `missed` | `target_date`, `criteria`, `progress_pct` |

### Relationship Types

```sql
CREATE TABLE edges (
  id          TEXT PRIMARY KEY,  -- ULID
  source_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,     -- Relationship type
  properties  TEXT DEFAULT '{}', -- JSON metadata
  created_at  TEXT NOT NULL,
  project     TEXT NOT NULL,
  UNIQUE(source_id, target_id, type)
);
```

| Relationship | Source → Target | Semantics | Example |
|---|---|---|---|
| `depends_on` | Task → Task | Source cannot start until target completes | "Implement API" depends_on "Design schema" |
| `blocks` | Blocker → Task | Blocker prevents task progress | "Missing credentials" blocks "Deploy to staging" |
| `produces` | Task → Artifact | Task creates/modifies an artifact | "Write migration" produces "schema.sql" |
| `references` | Any → Any | Informational link | Observation references a Decision |
| `decided_in` | Task/Artifact → Decision | Links work to the decision that authorized it | "Use PostgreSQL" decided_in "DB selection" |
| `updates` | Decision → Decision | Newer decision refines an older one | "Switch to SQLite" updates "Use PostgreSQL" |
| `contradicts` | Decision → Decision | Newer decision conflicts with an older one | Flagged for agent review |
| `part_of` | Task → Plan, Task → Milestone | Hierarchical containment | Sub-task is part_of a Plan |
| `implements` | Task → Plan | Task implements a plan | "Build auth module" implements "Security plan" |
| `child_of` | Task → Task | Parent-child task decomposition | Sub-task child_of parent task |

### Database Schema

```sql
-- Core tables
CREATE TABLE nodes (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL,
  project     TEXT NOT NULL,
  git_branch  TEXT DEFAULT 'main', -- Branch tracking for state isolation
  metadata    TEXT DEFAULT '{}',  -- JSON
  tags        TEXT DEFAULT '[]',  -- JSON array
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE edges (
  id          TEXT PRIMARY KEY,
  source_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  properties  TEXT DEFAULT '{}',
  project     TEXT NOT NULL,
  git_branch  TEXT DEFAULT 'main',
  created_at  TEXT NOT NULL,
  UNIQUE(source_id, target_id, type)
);

-- Schema version tracking
CREATE TABLE schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Indexes
CREATE INDEX idx_nodes_type ON nodes(type);
CREATE INDEX idx_nodes_status ON nodes(status);
CREATE INDEX idx_nodes_project ON nodes(project);
CREATE INDEX idx_nodes_project_branch ON nodes(project, git_branch);
CREATE INDEX idx_nodes_project_type ON nodes(project, type);
CREATE INDEX idx_nodes_project_status ON nodes(project, status);
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_edges_type ON edges(type);
CREATE INDEX idx_edges_project ON edges(project);
CREATE INDEX idx_edges_project_branch ON edges(project, git_branch);

-- FTS for title/metadata search
CREATE VIRTUAL TABLE nodes_fts USING fts5(
  title, metadata, tags,
  content='nodes',
  content_rowid='rowid'
);
```

### Indexing & Search

- **Full-text search**: SQLite FTS5 on `title`, `metadata`, and `tags` fields for fast keyword lookup.
- **No vector search in v1**: This is a structural/deterministic tool. Vector/semantic search adds LLM dependency and complexity — intentionally deferred. If needed later, it can be layered on via a separate embedding step.
- **Indexed columns**: `project`, `type`, `status`, `source_id`, `target_id`, `edge.type` — all indexed for fast filtered queries.

---

## 4. Core MCP Tools

### Tool Design Principles

1. **Coarse-grained write tools**: One `add_node`, one `add_edge` — the agent specifies the type. Avoids tool-count explosion.
2. **Fine-grained query tools**: Separate tools for different query patterns (list, search, traverse, analyze). Each returns structured JSON.
3. **All tools are project-scoped**: Every tool takes a `project` parameter (or uses a default).
4. **Deterministic**: No tool calls an LLM. Inputs and outputs are fully specified.

### Phase 1 — MVP Tools (12 tools)

#### Write / Mutation (5 tools)

**`add_node`** — Create a new node in the graph.
```typescript
{
  project: z.string(),
  type: z.enum(["task", "decision", "artifact", "plan", "observation", "blocker", "milestone"]),
  title: z.string(),
  status: z.string().optional(),       // Defaults per type
  metadata: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
}
// Returns: { id, type, title, status, created_at }
```

**`update_node`** — Update properties of an existing node.
```typescript
{
  project: z.string(),
  id: z.string(),
  title: z.string().optional(),
  status: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
}
// Returns: { id, type, title, status, updated_at }
```

**`add_edge`** — Create a relationship between two nodes.
```typescript
{
  project: z.string(),
  source_id: z.string(),
  target_id: z.string(),
  type: z.enum(["depends_on", "blocks", "produces", "references", "decided_in", "updates", "contradicts", "part_of", "implements", "child_of"]),
  properties: z.record(z.unknown()).optional(),
}
// Returns: { id, source_id, target_id, type, created_at }
```

**`remove_node`** — Delete a node and its connected edges.
```typescript
{
  project: z.string(),
  id: z.string(),
}
// Returns: { deleted_node_id, deleted_edge_count }
```

**`remove_edge`** — Delete a specific relationship.
```typescript
{
  project: z.string(),
  source_id: z.string(),
  target_id: z.string(),
  type: z.string(),
}
// Returns: { deleted: true }
```

#### Query / Read (4 tools)

**`list_nodes`** — List nodes with filtering.
```typescript
{
  project: z.string(),
  type: z.enum([...]).optional(),
  status: z.string().optional(),
  tags: z.array(z.string()).optional(),  // AND filter
  limit: z.number().default(50),
  offset: z.number().default(0),
}
// Returns: { nodes: [...], total_count }
```

**`get_node`** — Get a single node with all its edges.
```typescript
{
  project: z.string(),
  id: z.string(),
  include_edges: z.boolean().default(true),
}
// Returns: { node: {...}, inbound_edges: [...], outbound_edges: [...] }
```

**`search_nodes`** — Full-text search across nodes.
```typescript
{
  project: z.string(),
  query: z.string(),            // FTS5 query
  type: z.enum([...]).optional(),
  status: z.string().optional(),
  limit: z.number().default(20),
}
// Returns: { nodes: [...], total_count }
```

**`get_subgraph`** — Get a node and its N-hop neighborhood.
```typescript
{
  project: z.string(),
  root_id: z.string(),
  depth: z.number().default(2).max(5),
  edge_types: z.array(z.string()).optional(),  // Filter by edge type
  node_types: z.array(z.string()).optional(),  // Filter by node type
}
// Returns: { nodes: [...], edges: [...] }
```

#### Analytical (3 tools)

**`trace_dependencies`** — Follow dependency chains (like `trace_path` in codebase-memory-mcp).
```typescript
{
  project: z.string(),
  node_id: z.string(),
  direction: z.enum(["upstream", "downstream"]),  // upstream = what does this depend on; downstream = what depends on this
  edge_types: z.array(z.string()).default(["depends_on", "blocks", "child_of"]),
  max_depth: z.number().default(10),
}
// Returns: { chain: [{ node, depth, edge_type }...], has_cycle: boolean }
```

**`find_blockers`** — Surface all active blockers for a node or project.
```typescript
{
  project: z.string(),
  node_id: z.string().optional(),  // If omitted, find all blockers in project
  include_transitive: z.boolean().default(true),
}
// Returns: { blockers: [{ blocker_node, blocked_nodes: [...], chain_depth }...] }
```

**`get_project_summary`** — High-level project state overview.
```typescript
{
  project: z.string(),
}
// Returns: {
//   node_counts: { task: 12, decision: 5, ... },
//   status_breakdown: { task: { done: 5, in_progress: 3, ... } },
//   active_blockers: [...],
//   recent_decisions: [...],
//   progress: { total_tasks, completed_tasks, pct }
// }
```

### Phase 2 — Advanced Tools (6+ additional tools)

| Tool | Category | Description |
|---|---|---|
| `decision_trail` | Analytical | Trace the full chain of decisions that led to a given state: what was decided, what it updated/superseded, and what it contradicts. |
| `critical_path` | Analytical | Compute the longest dependency chain to a milestone — the minimum set of tasks that must complete. |
| `impact_analysis` | Analytical | "If I change/remove this node, what is affected downstream?" Returns all transitively dependent nodes. |
| `detect_contradictions` | Analytical | Scan for `contradicts` edges or status inconsistencies (e.g., a task marked `done` with active blockers). |
| `bulk_update` | Mutation | Update multiple nodes in a single call (e.g., mark a plan's tasks as cancelled). |
| `query_graph` | Query | Raw SQL/query interface for power users (with parameterization and safety limits). |
| `export_graph` | Utility | Export the full graph as JSON, DOT (Graphviz), Mermaid, or a self-contained interactive HTML file for local browser visualization. |
| `import_graph` | Utility | Import a previously exported graph (for migration/backup). |

---

## 5. Development Phases

### Phase 0: Foundations / Spike (3–5 days)

**Goal**: Validate the architecture, get a "hello world" MCP tool working end-to-end.

#### Detailed Tasks:
- [ ] **Task 0.1: Project Scaffolding**
  - Initialize npm package, configure `"type": "module"`.
  - Install dependencies: `@modelcontextprotocol/sdk`, `better-sqlite3`, `zod`, `ulid`.
  - Install devDependencies: `typescript`, `tsup`, `vitest`, `@types/better-sqlite3`.
  - Configure `tsconfig.json` for ESM compilation (`moduleResolution: "NodeNext"`, `target: "ES2022"`).
  - Configure `tsup.config.ts` for fast ESM bundling.
- [ ] **Task 0.2: SQLite Database Connection & Config**
  - Implement database setup file (`src/engine/db.ts`).
  - Configure synchronous SQLite driver to use WAL mode (`PRAGMA journal_mode = WAL;`) and busy timeout (`PRAGMA busy_timeout = 5000;`).
  - Implement dynamic project database mapping (`~/.state-graph-mcp/<project>/graph.db` or local `.state-graph/graph.db`).
- [ ] **Task 0.3: Database Schema Creation**
  - Write schema setup SQL script representing the `nodes`, `edges`, and `schema_meta` tables.
  - Implement automatic schema check and run SQL creation on initialization.
- [ ] **Task 0.4: Stdio Server Connection**
  - Setup core server bootstrap code (`src/index.ts`).
  - Wire up `McpServer` class and `StdioServerTransport` transport layers.
- [ ] **Task 0.5: Spike Tools Implementation**
  - Register `add_node` and `get_node` tools inside `src/server.ts` with Zod validation.
  - Connect tools to SQLite inserts and queries.
- [ ] **Task 0.6: Integration Smoke Test**
  - Compile the server code using `tsup`.
  - Launch the server via the MCP Inspector (`@modelcontextprotocol/inspector`) and verify basic JSON-RPC command exchange over stdin/stdout.
  - Create a temporary `.vscode/mcp.json` file and verify VS Code can spawn the server.

**Key risks to validate**:
- `better-sqlite3` native addon works reliably with npx/global install.
- stdio transport is stable with large JSON payloads.
- ULID generation is fast enough for batch operations.

---

### Phase 1: MVP — Core Value (2–3 weeks)

**Goal**: All 12 MVP tools working, tested, and usable by a real agent.

#### Detailed Tasks:
- [ ] **Task 1.1: Core Node Operations (Mutation & Validation)**
  - Implement `add_node` schema validation and database insert using parameterized SQL.
  - Implement `update_node` schema validation and database update.
  - Implement `remove_node` with cascade handling (ensure deleted nodes clean up their corresponding edges automatically in SQLite).
- [ ] **Task 1.2: Core Edge Operations & Cycle Detection**
  - Implement `add_edge` with strict validations (verify source and target nodes exist).
  - Add cycle detection algorithm (Depth-First Search) inside `add_edge` to prevent cycles for dependency-class edges (`depends_on`, `blocks`, `child_of`).
  - Implement `remove_edge`.
- [ ] **Task 1.3: Core Query Operations**
  - Implement `list_nodes` with comprehensive filters (type, status, tags, git_branch).
  - Add `compact` mode to `list_nodes` to return only essential fields (reducing token usage).
  - Implement `get_node` (returning the node along with its list of inbound and outbound edges).
  - Set up SQLite FTS5 index and implement `search_nodes` (full-text search over node properties).
  - Implement `get_subgraph` (recursive retrieval of neighbor nodes up to depth N).
- [ ] **Task 1.4: Analytical Graph Engines**
  - Implement `trace_dependencies` using SQLite `WITH RECURSIVE` queries to traverse upstream and downstream dependencies.
  - Implement `find_blockers` to traverse `blocks` relationships and find root blocker nodes.
  - Implement `get_project_summary` to compute completion progress percentages, count node distributions, and list active blockers.
- [ ] **Task 1.5: Workspace branch awareness**
  - Add logic to auto-run `git branch --show-current` on server startup and associate all write operations with the active branch.
  - Implement a branch-verification check before write operations to ensure the graph remains in sync if the user switches branches without restarting the server.
- [ ] **Task 1.6: Quality Assurance & Testing**
  - Write Vitest unit tests in `tests/engine/` for CRUD operations, cycle detection, and CTE query runs.
  - Write Vitest integration tests in `tests/integration/` spawning the MCP server and executing stdio requests.
  - Aim for ≥80% test coverage.

**Exit criteria**: An agent (Claude Code or Cursor) can create a project plan, track tasks, record decisions, and query blockers through the MCP tools in a real workflow.

---

### Phase 2: v1 — Polished & Usable (2–3 weeks)

**Goal**: Production-quality release. Smooth DX, documentation, robustness.

#### Detailed Tasks:
- [ ] **Task 2.1: Advanced Analytical Tools**
  - Implement `decision_trail` (trace historical and contradicted decisions).
  - Implement `critical_path` (find the longest blocking path of tasks leading to a milestone).
  - Implement `impact_analysis` (calculate downstream affected nodes if a target node is modified).
  - Implement `detect_contradictions` (scan for logical errors, e.g., tasks marked "done" but blocked by an active blocker).
- [ ] **Task 2.2: Export/Import Tools & Visualizer**
  - Implement `export_graph` (dumps database to JSON, DOT, or Mermaid formats).
  - Implement an **HTML Visualizer generator** in `export_graph` that creates a single, self-contained, interactive HTML file (using vis-network loaded via CDN) showing the zoomable, searchable graph nodes and edges.
  - Implement `import_graph` (restores database state from JSON).
- [ ] **Task 2.3: Power-user SQL query tool**
  - Implement `query_graph` allowing agents/developers to run parameterized SQL queries safely with read-only connection limits and hard limit execution guards.
- [ ] **Task 2.4: Database Schema Migrations**
  - Create database migration runner utility in `src/engine/db.ts`.
  - Add versioned, forward-only migrations files (e.g., `001-initial.sql`, `002-git-branch-support.sql`).
- [ ] **Task 2.5: Command Line Interface (CLI)**
  - Implement command-line interface in `src/cli.ts` using `commander` library.
  - Add CLI actions for: `init`, `inspect <project>` (ascii layout of project graphs), `view <project>` (generates and automatically opens the interactive HTML visualizer in the default browser), `export`, and `import`.
- [ ] **Task 2.6: Client Integrations & Config Examples**
  - Test and document setup profiles for Cursor, VS Code, Claude Desktop, and Claude Code.
  - Finalize configuration mappings, environment variable configs, and workspace directories.
- [ ] **Task 2.7: Publishing and CI/CD Setup**
  - Create GitHub Actions workflow file (`.github/workflows/ci.yml`) to automatically run linting (`eslint`), formatting (`prettier`), type-checking (`tsc`), and vitest testing.
  - Configure automated npm release pipeline on version tags.

**Exit criteria**: A developer can `npm install -g state-graph-mcp`, add it to their MCP config, and their agent can use it productively within 5 minutes.

---

### Phase 3: Advanced Features (ongoing)

**Goal**: Community-driven enhancements, performance, and ecosystem integration.

#### Detailed Tasks:
- [ ] **Task 3.1: Temporal Support**
  - Design `node_history` table tracking versions of nodes over time.
  - Implement historical querying parameters (`get_node({ id, at_timestamp })`).
- [ ] **Task 3.2: Cross-project Federation**
  - Allow edges to point to nodes in external databases.
  - Add cross-project linking logic.
- [ ] **Task 3.3: Web Dashboard / Visualization**
  - Build a lightweight web UI using Next.js/Vite to visualize active blocker trees and milestone Gantt charts.
- [ ] **Task 3.4: Event Hooks**
  - Enable HTTP webhook payloads or script execution callbacks when key nodes (like Milestones or Blockers) change statuses.
- [ ] **Task 3.5: Plugins and Custom Types**
  - Allow external config files to extend the list of allowed node types, statuses, and custom relation labels.

---

## 6. Key Technical Challenges & Mitigations

### 6.1 Graph Database Choice & Performance

**Challenge**: SQLite is not a graph database. Complex traversals (5+ hops on dense graphs) can be slow with recursive CTEs.

**Mitigations**:
- Agent workflows produce small, sparse graphs (typically <1000 nodes). SQLite handles this easily.
- `max_depth` parameters on all traversal tools prevent runaway queries.
- Prepared statements + WAL mode ensure fast reads.
- If a project hits performance limits, `export_graph` → migrate to a dedicated graph DB is always possible.
- Architecture keeps the graph engine behind an interface, enabling a future swap to Kuzu (embedded graph DB) or a native binary.

### 6.2 Packaging & Distribution

**Challenge**: `better-sqlite3` is a native addon requiring a C++ toolchain to compile, which breaks for some users on `npx`.

**Mitigations**:
- `better-sqlite3` ships prebuilt binaries for most platforms via `prebuild-install`. This covers >95% of users.
- Explicitly document supported platforms (Linux x64/arm64, macOS x64/arm64, Windows x64).
- Fallback: provide a Docker image for environments where native compilation fails.
- Future: if distribution friction is too high, consider `sql.js` (WASM SQLite) as a pure-JS fallback with slightly lower performance.

### 6.3 VS Code / Cursor Integration & Auto-Start

**Challenge**: Different MCP clients have different config formats and auto-start behaviors.

**Mitigations**:
- Provide tested config snippets for:
  - VS Code (`.vscode/mcp.json`)
  - Cursor (`.cursor/mcp.json`)
  - Claude Desktop (`claude_desktop_config.json`)
  - Claude Code (`.claude/settings.json` or `claude_code_config.json`)
- Use `#!/usr/bin/env node` shebang in the bin entry for cross-platform compatibility.
- The `bin` field in package.json ensures `npx state-graph-mcp` works without global install.
- Test auto-start behavior in each client during Phase 2.

### 6.4 Schema Evolution & Data Migration

**Challenge**: As the data model evolves, existing graphs need to migrate without data loss.

**Mitigations**:
- Schema version stored in `schema_meta` table.
- Forward-only migrations: each version bump has a migration script.
- Migrations run automatically on server startup (before MCP transport connects).
- All migrations are wrapped in transactions for atomicity.
- `export_graph` provides a JSON escape hatch for any migration that goes wrong.

### 6.5 Cycle Detection in Dependency Graphs

**Challenge**: Agents might create circular dependencies (`A depends_on B depends_on A`).

**Mitigations**:
- `add_edge` performs a cycle check for dependency-class edges (`depends_on`, `blocks`, `child_of`) before insertion.
- `trace_dependencies` returns a `has_cycle` flag if a cycle is detected during traversal.
- Cycle check uses a DFS from the target node to see if it can reach the source node; this is O(V+E) but acceptable for the expected graph sizes.
- Implement a safety limit (e.g., `max_nodes_for_cycle_check`) or timeout to prevent server hangs on extremely dense or malformed graphs.

### 6.6 Multi-Process Concurrency & SQLite Busy States

**Challenge**: Multiple independent agent runtimes (or background tasks) might call the MCP server at the exact same time, leading to SQLite database lock collisions and `SQLITE_BUSY` errors.

**Mitigations**:
- Configure SQLite Write-Ahead Logging (WAL mode) by running `PRAGMA journal_mode = WAL;` during DB initialization. WAL allows concurrent reads while writing occurs.
- Set a busy timeout of 5000ms via `PRAGMA busy_timeout = 5000;`. SQLite will automatically block and retry instead of immediately returning a locking error when another process holds a write lock.
- Keep write transactions extremely short. Avoid executing any async code (like network requests or filesystem reads) inside database transactions.

### 6.7 Git Branch Awareness & Workspace Isolation

**Challenge**: Agents operate on different Git branches. If they record tasks, decisions, or blockers on a feature branch, switching branches can leave the graph out-of-sync with the workspace state.

**Mitigations**:
- Implement a lightweight branch-verification check before write operations to handle branch switches during a long-lived server session.
- Auto-detect the current Git branch on startup by calling `git branch --show-current` in the workspace directory.
- Store a `git_branch` property on every node and edge (defaulting to the active branch).
- Allow the calling agent to filter list and traversal queries by `git_branch` or specify a branch target.
- Keep the database file inside the project-local `.state-graph/` directory. Because the directory is ignored in `.gitignore`, the local database file is persistent across branch checkouts, but the content remains branch-aware.

### 6.8 LLM Token Optimization & Output Compacting

**Challenge**: Large projects can produce graphs with hundreds of nodes. Returning full JSON metadata blocks for node listings or traversals will rapidly consume the LLM's context window.

**Mitigations**:
- Implement a `compact` boolean option in all list and query tools. When `compact: true` is set, the server only returns a minimal node representation (ID, type, title, status, and direct branch/tag fields), omitting the verbose `metadata` JSON block.
- Enforce strict default pagination on `list_nodes` (e.g., `limit` defaults to 50, maximum of 200) and `search_nodes` (defaults to 20).
- Truncate overly long metadata fields or large text fields in analytical query responses if they exceed threshold token sizes.

---

## 7. Testing & Validation Strategy

### Unit Tests (Graph Engine)

```
tests/
  engine/
    node-ops.test.ts       # CRUD for all node types
    edge-ops.test.ts       # CRUD + cycle detection
    query-ops.test.ts      # list, search, subgraph
    analytical-ops.test.ts # trace, blockers, summary
    migration.test.ts      # Schema upgrades
  schema/
    validation.test.ts     # Zod schema edge cases
```

- Use in-memory SQLite (`:memory:`) for fast, isolated tests.
- Test all node types, status transitions, edge constraints.
- Test cycle detection: ensure `add_edge` rejects cycles for `depends_on` but allows them for `references`.
- Property: every graph operation is reversible (add → remove leaves the graph unchanged).

### Integration Tests (MCP Protocol)

```
tests/
  integration/
    mcp-roundtrip.test.ts  # Full stdio round-trip for each tool
    multi-project.test.ts  # Project isolation
    error-handling.test.ts # Invalid inputs, missing nodes
```

- Spawn the MCP server as a child process.
- Send JSON-RPC requests over stdin, validate responses on stdout.
- Test error cases: duplicate edges, missing nodes, invalid types.

### Evaluation with Real Workflows

- **Scenario tests**: Script a realistic agent workflow (create plan → decompose into tasks → record decisions → mark blockers → query critical path) and validate the graph state at each step.
- **Agent integration test**: Use Claude Code or Cursor with state-graph-mcp configured, and run through a real coding task to validate the UX.
- **Benchmark**: Measure query latency for graphs of 10, 100, 1000, and 5000 nodes. Target: all queries under 50ms for 1000-node graphs.

### CI Pipeline

```yaml
# GitHub Actions
- lint (eslint + prettier)
- typecheck (tsc --noEmit)
- test (vitest run --coverage)
- build (tsup)
- smoke test (npx . --help)
```

---

## 8. Distribution, Documentation & Adoption

### Packaging & Installation

**Primary distribution**: npm

```json
{
  "name": "state-graph-mcp",
  "bin": {
    "state-graph-mcp": "./dist/cli.js"
  },
  "files": ["dist", "README.md", "LICENSE"]
}
```

**Installation methods**:
```bash
# Direct use (no install)
npx state-graph-mcp

# Global install
npm install -g state-graph-mcp

# Project-local
npm install --save-dev state-graph-mcp
```

### MCP Configuration Examples

**VS Code** (`.vscode/mcp.json`):
```json
{
  "servers": {
    "state-graph": {
      "command": "npx",
      "args": ["-y", "state-graph-mcp"],
      "env": {
        "STATE_GRAPH_DIR": "${workspaceFolder}/.state-graph"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "state-graph": {
      "command": "npx",
      "args": ["-y", "state-graph-mcp"]
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "state-graph": {
      "command": "npx",
      "args": ["-y", "state-graph-mcp"]
    }
  }
}
```

### Environment Variables & Configuration

The server should be configurable using the following environment variables:

| Environment Variable | Description | Default Value |
|---|---|---|
| `STATE_GRAPH_DIR` | Absolute path to directory where database files are stored. | `.state-graph/` (Project-local, in CWD) |
| `STATE_GRAPH_LOG_LEVEL` | Logging verbosity on `stderr` (`debug`, `info`, `warn`, `error`). | `info` |
| `STATE_GRAPH_DEFAULT_BRANCH` | Fallback branch name if Git cannot be queried on startup. | `main` |

### Bootstrapping Configuration Templates

To ensure another agent can immediately bootstrap the environment, here are the exact contents for the key configuration files:

#### `package.json`
```json
{
  "name": "state-graph-mcp",
  "version": "0.1.0",
  "description": "Deterministic, persistent graph server for tracking workflow state, decisions, and blockers.",
  "type": "module",
  "main": "./dist/index.js",
  "bin": {
    "state-graph-mcp": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsup src/index.ts src/cli.ts --format esm --clean --dts",
    "dev": "tsup src/index.ts src/cli.ts --format esm --watch --onSuccess 'node dist/index.js'",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts tests/**/*.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "better-sqlite3": "^11.0.0",
    "commander": "^12.0.0",
    "ulid": "^2.3.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.10",
    "@types/node": "^20.12.7",
    "eslint": "^9.0.0",
    "prettier": "^3.2.5",
    "tsup": "^8.0.2",
    "typescript": "^5.4.5",
    "vitest": "^1.5.0"
  }
}
```

#### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "declaration": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### `tsup.config.ts`
```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  shims: true,
  sourcemap: true,
  splitting: false,
});
```

### Documentation Structure

```
docs/
  README.md              # Quick start, installation, basic usage
  ARCHITECTURE.md        # Technical architecture deep-dive
  DATA_MODEL.md          # Full schema reference
  TOOL_REFERENCE.md      # Every tool with examples
  COOKBOOK.md             # Common workflows and patterns
  AGENT_PROMPTS.md       # Recommended system prompt snippets for agents
  CONFIGURATION.md       # Environment variables, data directory, etc.
  CONTRIBUTING.md        # Development setup, PR guidelines
  CHANGELOG.md           # Version history
```

**Key documentation priorities**:
1. **README** must get a user from zero to working in <5 minutes.
2. **COOKBOOK** should show agents (and developers) how to use the tools in realistic workflows.
3. **AGENT_PROMPTS.md** should provide copy-paste system prompt snippets that teach agents how to use state-graph-mcp effectively (similar to codebase-memory-mcp's approach).

---

## 9. Future Extensibility

### Temporal Support (Phase 3+)

- **Node versioning**: Store a `version` counter on each node; ever
- **Ghost Node Handling**: Ensure analytical tools (like `trace_dependencies`) are updated to ignore edges connected to soft-deleted nodes when temporal/versioning support is active.y `update_node` creates a snapshot in a `node_history` table.
- **"State at time T" queries**: `get_node({ id, at: "2025-01-15T..." })` returns the node as it was at that timestamp.
- **Decision timeline**: Visualize how decisions evolved over time.

### Multi-Project Support (Phase 3+)

- **Cross-project references**: Allow edges between nodes in different projects (e.g., "shared library decision" affects multiple projects).
- **Project federation**: Query across all projects (`list_nodes({ project: "*" })`).

### Visualization (Phase 3+)

- **Mermaid export**: `export_graph({ format: "mermaid" })` for embedding in docs.
- **DOT/Graphviz export**: For more complex visualization.
- **Web UI**: Optional lightweight web dashboard (served on localhost) for browsing the graph. Not a priority for v1 — the MCP tools are the primary interface.

### Event System (Phase 3+)

- **Webhooks/callbacks**: Emit events when nodes change status (e.g., task completed, blocker created).
- **Integration with CI/CD**: Trigger actions when milestones are reached.

### Plugin Architecture (Phase 3+)

- **Custom node types**: Allow users to register new node types with their own status enums and validation rules.
- **Custom relationship types**: Same for edges.
- **Computed properties**: Plugins that compute derived values (e.g., "effort remaining" based on sub-task estimates).

---

## 10. Risks & Open Questions

### Major Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `better-sqlite3` native addon installation failures | Medium | High (blocks adoption) | Prebuild binaries cover most platforms; document fallbacks; consider sql.js WASM alternative |
| Agents don't use the tools effectively without prompting | High | Medium (reduces value) | Provide excellent AGENT_PROMPTS.md; test with multiple agents; iterate on tool names/descriptions |
| Schema changes break existing graphs | Medium | High | Forward-only migrations with version tracking; export/import escape hatch |
| Tool count overwhelms agents | Low | Medium | Start with 12 tools (MVP); add more only when validated; group tools by category in descriptions |
| Competition from Graphiti/MemoryGraph | Medium | Low | Different focus (workflow vs. knowledge); complementary positioning |

### Open Questions (Decide Early)

1. **Data directory location**: Should the default be `~/.state-graph-mcp/` (global), `$PROJECT/.state-graph/` (project-local), or configurable via env var? 
   - **Recommendation**: Default to project-local (`$STATE_GRAPH_DIR` or `.state-graph/` in the working directory), with an env var override. This keeps graphs co-located with projects and easy to `.gitignore`.

2. **Project naming**: Should the `project` parameter be required on every tool call, or should the server auto-detect from the working directory?
   - **Recommendation**: Auto-detect from CWD by default (basename of the working directory), but allow override via the `project` parameter. This reduces boilerplate for single-project use.

3. **Status validation**: Should `status` values be strictly validated against the allowed set per node type, or should any string be accepted?
   - **Recommendation**: Strict validation in v1. This prevents typos and ensures consistent queries. Custom statuses can be added in the plugin system (Phase 3).

4. **Edge uniqueness**: Should multiple edges of the same type between the same two nodes be allowed?
   - **Recommendation**: No. `UNIQUE(source_id, target_id, type)` constraint. If an agent needs to express multiple relationships, they should use different types or add metadata to the edge properties.

5. **Soft deletes**: Should `remove_node` hard-delete or soft-delete (set a `deleted_at` timestamp)?
   - **Recommendation**: Hard delete in v1 for simplicity. Temporal support (Phase 3) will provide undo capability via node history.

6. **Max graph size**: Should there be a hard limit on nodes per project to prevent performance degradation?
   - **Recommendation**: No hard limit, but `get_project_summary` should warn when node count exceeds 5000. Document performance characteristics.

---

## Appendix: Project File Structure

```
state-graph-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── cli.ts                # CLI wrapper (bin entry)
│   ├── server.ts             # MCP server setup and tool registration
│   ├── engine/
│   │   ├── graph.ts          # Main graph engine class
│   │   ├── nodes.ts          # Node CRUD operations
│   │   ├── edges.ts          # Edge CRUD + cycle detection
│   │   ├── queries.ts        # List, search, subgraph operations
│   │   ├── analytics.ts      # Trace, blockers, summary, critical path
│   │   └── db.ts             # SQLite initialization, migrations
│   ├── schema/
│   │   ├── types.ts          # TypeScript types and enums
│   │   ├── zod.ts            # Zod schemas for all tool inputs
│   │   └── migrations/
│   │       ├── 001-initial.ts
│   │       └── 002-fts.ts
│   ├── tools/
│   │   ├── write.ts          # add_node, update_node, add_edge, remove_*
│   │   ├── query.ts          # list_nodes, get_node, search_nodes, get_subgraph
│   │   └── analytical.ts     # trace_dependencies, find_blockers, get_project_summary
│   └── utils/
│       ├── id.ts             # ULID generation
│       ├── time.ts           # ISO 8601 helpers
│       └── logger.ts         # stderr logger
├── tests/
│   ├── engine/
│   ├── integration/
│   └── fixtures/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── TOOL_REFERENCE.md
│   ├── COOKBOOK.md
│   └── AGENT_PROMPTS.md
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── .eslintrc.cjs
├── .prettierrc
├── .gitignore
├── LICENSE
├── README.md
├── CHANGELOG.md
└── PLAN.md                   # This file
```

---

## Appendix: Recommended Agent Prompt Snippet

Include this in your AI agent's system prompt or rules to teach it how to use state-graph-mcp:

```markdown
## Workflow State Graph (state-graph-mcp)

This project uses state-graph-mcp to maintain a persistent graph of tasks, decisions, and project state.

### Priority Order
1. `get_project_summary` — Start here to understand current project state
2. `list_nodes` — Find tasks, decisions, blockers by type and status
3. `trace_dependencies` — Trace what depends on or blocks a task
4. `find_blockers` — Surface active blockers preventing progress
5. `search_nodes` — Full-text search across all nodes
6. `get_subgraph` — Explore a node's neighborhood

### When to Write
- Starting a new task: `add_node(type: "task", ...)`
- Making a design decision: `add_node(type: "decision", ...)` with rationale
- Encountering a blocker: `add_node(type: "blocker", ...)` + `add_edge(type: "blocks")`
- Completing work: `update_node(status: "done")`
- Creating a file: `add_node(type: "artifact", ...)` + `add_edge(type: "produces")`

### When to Read
- Before starting work: `get_project_summary` + `find_blockers`
- Before making a decision: `search_nodes` for prior decisions on the topic
- When stuck: `trace_dependencies(direction: "upstream")` to find root causes
```
