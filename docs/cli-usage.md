# CLI Command Reference & Git Integration

`state-memory-mcp` comes with a powerful command line interface (CLI) to manage project state databases, inspect graphs, export visuals, and sync across repositories.

---

## 🛠️ CLI Command Reference

```bash
# Initialize state-memory-mcp in your project (creates .state-memory-mcp/,
# updates .gitignore, scaffolds IDE instructions and MCP configs)
state-memory-mcp init [--no-git] [--commits <n>] [--no-tasks] [--no-artifacts]

# Start the MCP server (used by IDE configs)
state-memory-mcp run

# View the interactive 3D graph visualizer in your default browser
state-memory-mcp view --project my-project

# Inspect project nodes in ASCII format
state-memory-mcp inspect --project my-project

# Display project graph ROI, productivity, and token savings metrics
state-memory-mcp metrics --project my-project

# Export graph data (JSON, DOT, Mermaid, HTML formats supported)
state-memory-mcp export --project my-project --format html --out graph.html
state-memory-mcp export --project my-project --format mermaid

# Import graph data from a JSON file (overwrites existing project data)
state-memory-mcp import data.json --project my-project

# Incrementally scan git history into the graph
state-memory-mcp scan-git --project my-project --commits 30

# Back up the project database to a SQLite file
state-memory-mcp backup --project my-project --out backup.db

# Restore the project database from a SQLite backup file (destructively overwrites)
state-memory-mcp restore backup.db --project my-project

# Audit project and sub-directory databases for integrity, cycles, and contradictions
state-memory-mcp audit --project my-project

# Run environment health checks (Node, SQLite, FTS5, permissions, root & sub-directory git repos, graph integrity)
state-memory-mcp doctor --project my-project

# Update state-memory-mcp globally to the latest version published on npm
state-memory-mcp update

# Merge an external SQLite database into the current project database
state-memory-mcp merge other-project.db --project my-project [--force]
```

---

## 🌐 Global Multi-Project Synchronization (`init-global`)

Running `state-memory-mcp init-global` re-scaffolds instruction files, rule templates, and agent custom skills across **all projects registered in `~/.state-memory-mcp/projects.json`** in a single turn:

```bash
# Re-initialize all registered projects
state-memory-mcp init-global

# Re-initialize and clean stale registrations for missing directories
state-memory-mcp init-global --clean-stale

# Scan a workspace directory to register and initialize all sub-projects
state-memory-mcp init-global --scan ~/Downloads/working
```

All operations are idempotent — running `init` or `init-global` multiple times is safe.

---

## 🐙 Git Commit History Scanner

The Git Scanner (`scanGit`) hooks directly into your local git repository to automatically construct a semantic workflow map of your commits:

- **Conventional Commit Parsing**: Commit messages are parsed for conventional type tags (e.g. `feat:`, `fix:`, `docs:`, `refactor:`).
- **Observation Creation**: Every scanned commit generates an `observation` node carrying metadata like commit hash, author email, timestamp, and files modified.
- **Task Seeding**: High-value commits (like those containing active feature work) automatically generate associated `task` nodes linked to the commit observation via an `extends` relationship.
- **Artifact Tracking**: The scanner tracks modified files. If a file is frequently modified (exceeding hotness thresholds), the scanner creates an `artifact` node and links the corresponding commit observation to it using a `modifies` relationship.
