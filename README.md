# state-graph-mcp

`state-graph-mcp` is a zero-infrastructure, deterministic Model Context Protocol (MCP) server that provides AI agents with a structured, persistent graph for tracking workflow state—tasks, decisions, artifacts, plans, blockers, and their semantic relationships.

By using `state-graph-mcp`, your AI coding assistant (such as Cursor, Claude Code, or Copilot) maintains long-term project coherence, manages complex dependencies, and audits architectural decisions across sessions.

---

## Key Features

1. **Deterministic State Graph**: No LLM in the loop; all operations are structured, deterministic, and fast.
2. **SQLite Storage**: Zero-infrastructure database persisted project-locally (under `.state-graph-mcp/`) or globally.
3. **23 Core MCP Tools**: Covers Node CRUD, relationship linking, circular dependency rejection, full-text search (FTS5), dependency path tracing, blocker analysis, and database administration utilities.
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

## Tool Reference (23 Tools)

* **Mutation (5 tools)**: `add_node`, `update_node`, `remove_node`, `add_edge`, `remove_edge`.
* **Query (4 tools)**: `list_nodes` (compact mode, pagination, tag filtering), `get_node` (details + edges), `search_nodes` (FTS5 search), `get_subgraph` (N-hop neighbor fetch).
* **MVP Analytics (3 tools)**: `trace_dependencies`, `find_blockers`, `get_project_summary`.
* **Advanced Analytics & Utilities (7 tools)**:
  * `decision_trail`: Traces updates/contradicts chains of decisions.
  * `critical_path`: Evaluates longest path of active tasks to a milestone.
  * `impact_analysis`: Evaluates downstream affected nodes if modified/deleted.
  * `detect_contradictions`: Catches done tasks with blockers or contradicting decisions.
  * `export_graph`: Dumps graph in JSON, DOT, Mermaid, or HTML visualizer.
  * `import_graph`: Bulk imports nodes and edges.
  * `query_graph`: Safe, read-only SELECT SQL interface.
* **Database Administration (4 tools)**:
  * `backup_project_db`: Hot backup of project SQLite database.
  * `restore_project_db`: Destructive restore of project database from a backup file.
  * `audit_project_db`: Integrity checks, circular dependency detection, and logical contradiction auditing.
  * `merge_project_db`: Merge another project's database with conflict and cycle safety checks.

---

## Testing

```bash
# Run unit and integration tests
npm run test
```