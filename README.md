# state-graph-mcp

`state-graph-mcp` is a zero-infrastructure, deterministic Model Context Protocol (MCP) server that provides AI agents with a structured, persistent graph for tracking workflow state—tasks, decisions, artifacts, plans, blockers, and their semantic relationships.

By using `state-graph-mcp`, your AI coding assistant (such as Cursor, Claude Code, or Copilot) maintains long-term project coherence, manages complex dependencies, and audits architectural decisions across sessions.

---

## Key Features

1. **Deterministic State Graph**: No LLM in the loop; all operations are structured, deterministic, and fast.
2. **SQLite Storage**: Zero-infrastructure database persisted project-locally (under `.state-graph-mcp/`) or globally.
3. **27 Core MCP Tools**: Covers Node CRUD, relationship linking, circular dependency rejection, full-text search (FTS5), dependency path tracing, blocker analysis, database administration utilities, template scaffolding, and agent QoL context tools.
4. **Interactive HTML Visualizer**: Easily export or view your project state graph in your browser using an interactive, dark-themed visualizer built with `vis-network`.
5. **Safe SQL Querying**: Safe read-only SELECT querying against the database for advanced analytics.
6. **Git Branch Awareness**: Dynamically tracks and filters states based on the checkout workspace Git branch.
7. **One-Command Setup**: `state-graph-mcp init` scaffolds the data directory, `.gitignore`, IDE instruction files, and MCP configs for all major editors.

---

## Quick Start

```bash
# Install globally
npm install -g state-graph-mcp

# Navigate to your project
cd your-project

# Initialize — creates .state-graph-mcp/, updates .gitignore,
# scaffolds IDE instructions and MCP configs
state-graph-mcp init

# Done! Your IDE now has MCP configs + agent instructions.
```

---

## Installation

```bash
# Global install (recommended)
npm install -g state-graph-mcp

# Or use directly with npx (no install)
npx state-graph-mcp

# Or install as a project dev dependency
npm install --save-dev state-graph-mcp
```

---

## CLI Usage

`state-graph-mcp` comes with a powerful command line interface to manage project databases:

```bash
# Initialize state-graph-mcp in your project (creates .state-graph-mcp/,
# updates .gitignore, scaffolds IDE instructions and MCP configs)
state-graph-mcp init

# Start the MCP server (used by IDE configs)
state-graph-mcp run

# View the interactive graph visualizer in your default browser
state-graph-mcp view --project my-project

# Inspect project nodes in ASCII format
state-graph-mcp inspect --project my-project

# Export graph data (JSON, DOT, Mermaid, HTML formats supported)
state-graph-mcp export --project my-project --format html --out graph.html
state-graph-mcp export --project my-project --format mermaid

# Import graph data from a JSON file (overwrites existing project data)
state-graph-mcp import data.json --project my-project

# Incrementally scan git history into the graph
state-graph-mcp scan-git --project my-project --commits 30

# Back up the project database to a SQLite file
state-graph-mcp backup --project my-project --out backup.db

# Restore the project database from a SQLite backup file (destructively overwrites)
state-graph-mcp restore backup.db --project my-project

# Audit the project database for integrity, cycle paths, and contradictions
state-graph-mcp audit --project my-project

# Merge an external SQLite database into the current project database
state-graph-mcp merge other-project.db --project my-project

```

---

## MCP Configuration Examples

Running `state-graph-mcp init` automatically creates these configuration files for you. If you prefer to configure manually:

### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "state-graph-mcp": {
      "command": "state-graph-mcp",
      "args": ["run"]
    }
  }
}
```

### VS Code (`.vscode/mcp.json`)
```json
{
  "servers": {
    "state-graph-mcp": {
      "command": "state-graph-mcp",
      "args": ["run"]
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)
On macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%\Claude\claude_desktop_config.json`
```json
{
  "mcpServers": {
    "state-graph-mcp": {
      "command": "state-graph-mcp",
      "args": ["run"]
    }
  }
}
```

---

## What `init` Sets Up

Running `state-graph-mcp init` in your project root will:

1. Create the `.state-graph-mcp/` data directory
2. Add `.state-graph-mcp` to your `.gitignore`
3. Create/append IDE instruction files for:
   - **Gemini** (`.gemini/instructions.md`)
   - **Cursor** (`.cursor/rules/state-graph-mcp.mdc`)
   - **GitHub Copilot** (`.github/copilot-instructions.md`)
   - **VS Code** (`.vscode/instructions.md`)
   - **Claude Code** (`CLAUDE.md`)
   - **Windsurf** (`.windsurfrules`)
4. Create MCP server configs for Cursor and VS Code

All operations are idempotent — running `init` multiple times is safe.

---

## Environment Variables

| Variable | Description | Default Value |
|---|---|---|
| `STATE_GRAPH_MCP_DIR` | Absolute path to directory where database files are stored. | `.state-graph-mcp/` (Project-local, in CWD) |
| `STATE_GRAPH_MCP_LOG_LEVEL` | Logging verbosity on `stderr` (`debug`, `info`, `warn`, `error`). | `info` |
| `STATE_GRAPH_MCP_DEFAULT_BRANCH` | Fallback branch name if Git cannot be queried on startup. | `main` |

---

## Tool Reference (27 Tools)

### 🟢 Node & Relationship Management (6 Tools)
* **`add_node`**: Creates a node (`task`, `decision`, `artifact`, `plan`, `observation`, `blocker`, `milestone`).
  * Inputs: `type`, `title`, `project`, `status`, `metadata`, `tags`.
* **`update_node`**: Modifies properties (title, status, metadata, tags) of an existing node.
  * Inputs: `id`, `project`, `title`, `status`, `metadata`, `tags`.
* **`get_node`**: Fetches a node's details and all inbound/outbound relationships.
  * Inputs: `id`, `project`, `include_edges`.
* **`remove_node`**: Deletes a node and automatically cascades deletions to all connected edges.
  * Inputs: `id`, `project`.
* **`add_edge`**: Links two nodes with a typed relationship (`depends_on`, `blocks`, `produces`, `references`, `decided_in`, `updates`, `contradicts`, `part_of`, `implements`, `child_of`). Cycles are rejected for directed dependency types.
  * Inputs: `source_id`, `target_id`, `type`, `project`, `properties`.
* **`remove_edge`**: Deletes a specific relationship between two nodes.
  * Inputs: `source_id`, `target_id`, `type`, `project`.

### 🔍 Search & Querying (4 Tools)
* **`list_nodes`**: Returns lists of nodes matching filters with support for compact mode, pagination, tags, and branch tracking.
  * Inputs: `type`, `status`, `tags`, `project`, `limit`, `offset`, `compact`, `git_branch`.
* **`search_nodes`**: Performs fast full-text search (FTS5) across title, metadata, and tags.
  * Inputs: `query`, `type`, `status`, `limit`, `project`.
* **`get_subgraph`**: Extracts a node and its N-hop neighbor nodes and connecting relationships.
  * Inputs: `root_id`, `depth`, `edge_types`, `node_types`, `project`.
* **`query_graph`**: Executes safe, read-only SELECT SQL queries against the underlying database. Sanitized to block dangerous SQLite functions.
  * Inputs: `sql`, `params`, `project`.

### 🧠 Advanced Analytics & Tracing (7 Tools)
* **`trace_dependencies`**: Computes recursive upstream (requirements) or downstream (dependents) dependency chains.
  * Inputs: `node_id`, `direction`, `edge_types`, `max_depth`, `project`.
* **`find_blockers`**: Lists active blocker nodes and the tasks/milestones they block.
  * Inputs: `node_id`, `include_transitive`, `project`.
* **`get_project_summary`**: Provides a high-level project summary containing node breakdowns, task completion progress, recent decisions, and active blockers.
  * Inputs: `project`.
* **`decision_trail`**: Traces the historical chain of decisions that led to a given state (updates/contradicts).
  * Inputs: `node_id`, `project`.
* **`critical_path`**: Computes the longest chain of uncompleted tasks leading to a milestone (minimum set of tasks that must finish).
  * Inputs: `milestone_id`, `project`.
* **`impact_analysis`**: Calculates the downstream blast radius if a node is modified or deleted.
  * Inputs: `node_id`, `project`.
* **`detect_contradictions`**: Scans the project for logical flaws (e.g. completed tasks that still have active blockers, contradicting accepted decisions).
  * Inputs: `project`.

### 🤖 Agent QoL & Templates (4 Tools)
* **`get_context_snapshot`**: Dual-format context snapshot returning structured JSON data (blockers, pending tasks) and pre-rendered Markdown for quick agent prompting.
  * Inputs: `project`.
* **`find_related_decisions`**: Finds all decisions that affected a given artifact node (directly or via milestones).
  * Inputs: `artifact_id`, `project`.
* **`find_blocked_tasks`**: Finds all tasks blocked directly or transitively by a decision node.
  * Inputs: `decision_id`, `project`.
* **`scaffold_template`**: Automates scaffolding of standard development workflows. Supported templates: `fdd` (Feature-Driven Development design/build milestones & tasks) and `rfc` (Request for Comments author/review/decision loop).
  * Inputs: `template`, `name`, `project`.

### 🛡️ Administration & Backups (6 Tools)
* **`export_graph`**: Exports project graph to JSON, DOT, Mermaid flowchart, or interactive HTML formats.
  * Inputs: `format`, `project`.
* **`import_graph`**: Bulk loads nodes and edges from external files.
  * Inputs: `nodes`, `edges`, `project`.
* **`backup_project_db`**: Creates an online SQLite database backup file along with an integrity SHA-256 checksum file.
  * Inputs: `outputPath`, `project`.
* **`restore_project_db`**: Restores the database from a backup file, checking the structural SQLite integrity and matching the SHA-256 checksum file.
  * Inputs: `backupPath`, `project`.
* **`audit_project_db`**: Audits database structure, foreign key constraints, orphaned edges, cycles, and logical contradictions.
  * Inputs: `project`.
* **`merge_project_db`**: Safely merges two project databases, keeping the newer node (based on `updated_at`) and validating circular dependencies.
  * Inputs: `sourcePath`, `force`, `project`.

---

## Interactive HTML Visualizer

`state-graph-mcp` offers an interactive, dark-mode browser visualization to explore your project's workflow state graph.

### Viewing the Visualizer
To generate and view the visualizer instantly in your default web browser, run:
```bash
state-graph-mcp view --project my-project
```
This command:
1. Generates a standalone `viewer.html` containing the embedded graph dataset.
2. Saves it in the project database folder.
3. Automatically launches the page in your browser.

### Exporting the Visualizer
To export the visualizer to a specific file:
```bash
state-graph-mcp export --project my-project --format html --out ./my-graph.html
```
You can share the exported HTML file with your team. The file contains a responsive Force-Directed network graph rendering with:
- Hover details for nodes and relationships.
- Distinct color-coded nodes based on types.
- Zooming, panning, and automatic physics layouts.

---

## Testing

```bash
# Run unit and integration tests
npm run test
```