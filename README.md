# state-graph-mcp

`state-graph-mcp` is a zero-infrastructure, deterministic Model Context Protocol (MCP) server that provides AI agents with a structured, persistent graph for tracking workflow state—tasks, decisions, artifacts, plans, blockers, and their semantic relationships.

By using `state-graph-mcp`, your AI coding assistant (such as Cursor, Claude Code, or Copilot) maintains long-term project coherence, manages complex dependencies, and audits architectural decisions across sessions.

---

## Key Features

1. **Deterministic State Graph**: No LLM in the loop; all operations are structured, deterministic, and fast.
2. **SQLite Storage**: Zero-infrastructure database persisted project-locally (under `.state-graph/`) or globally.
3. **19 Core MCP Tools**: Covers Node CRUD, relationship linking, circular dependency rejection, full-text search (FTS5), dependency path tracing, and blocker analysis.
4. **Interactive HTML Visualizer**: Easily export or view your project state graph in your browser using an interactive, dark-themed visualizer built with `vis-network`.
5. **Safe SQL Querying**: Safe read-only SELECT querying against the database for advanced analytics.
6. **Git Branch Awareness**: Dynamically tracks and filters states based on the checkout workspace Git branch.

---

## Installation

```bash
# Clone the repository
git clone https://github.com/LucasArmstrong/state-graph-mcp.git
cd state-graph-mcp

# Install dependencies
npm install

# Compile the ESM bundle
npm run build
```

---

## CLI Usage

`state-graph-mcp` comes with a powerful command line interface to manage project databases:

```bash
# Initialize a .state-graph folder in your current workspace
node dist/cli.js init

# View the interactive graph visualizer in your default browser
node dist/cli.js view --project my-project

# Inspect project nodes in ASCII format
node dist/cli.js inspect --project my-project

# Export graph data (JSON, DOT, Mermaid, HTML formats supported)
node dist/cli.js export --project my-project --format html --out graph.html
node dist/cli.js export --project my-project --format mermaid

# Import graph data from a JSON file (overwrites existing project data)
node dist/cli.js import data.json --project my-project
```

---

## MCP Configuration Examples

### Cursor (`.cursor/mcp.json`)
Add the following to your Cursor configuration file to register the server:
```json
{
  "mcpServers": {
    "state-graph": {
      "command": "node",
      "args": ["/absolute/path/to/state-graph-mcp/dist/index.js"]
    }
  }
}
```

### VS Code (`.vscode/mcp.json`)
```json
{
  "servers": {
    "state-graph": {
      "command": "node",
      "args": ["/absolute/path/to/state-graph-mcp/dist/index.js"]
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
    "state-graph": {
      "command": "node",
      "args": ["/absolute/path/to/state-graph-mcp/dist/index.js"]
    }
  }
}
```

---

## Environment Variables

| Variable | Description | Default Value |
|---|---|---|
| `STATE_GRAPH_DIR` | Absolute path to directory where database files are stored. | `.state-graph/` (Project-local, in CWD) |
| `STATE_GRAPH_LOG_LEVEL` | Logging verbosity on `stderr` (`debug`, `info`, `warn`, `error`). | `info` |
| `STATE_GRAPH_DEFAULT_BRANCH` | Fallback branch name if Git cannot be queried on startup. | `main` |

---

## Tool Reference (19 Tools)

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

---

## Testing

```bash
# Run unit and integration tests
npm run test
```