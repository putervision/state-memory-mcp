# State-Memory-MCP Storage & Directory Structure

`state-memory-mcp` uses zero-infrastructure SQLite databases for state persistence. Storage locations are determined automatically based on workspace detection and environment variables.

---

## Directory Hierarchy

### 1. Local Workspace Storage (Default)
When executed inside a workspace folder containing a `.state-memory-mcp/` directory (or after running `state-memory-mcp init`), data is stored project-locally:

```
<project-root>/
├── .state-memory-mcp/
│   ├── <project-slug>/
│   │   ├── graph.db          # Main SQLite database (WAL mode)
│   │   ├── graph.db-wal      # Write-Ahead Log file
│   │   ├── graph.db-shm      # Shared memory file
│   │   └── backups/          # Timestamped online database backups
│   │       ├── backup-20260722-150000.db
│   │       └── backup-20260722-150000.db.sha256
│   └── .gitignore            # Auto-generated gitignore disallowing db locks
├── .state-memory-mcp.json    # Project config (allowed export dirs, rules)
└── .agents/
    ├── AGENTS.md             # Custom agent memory & workflow rules
    └── skills/
        └── state-memory-mcp/ # State memory MCP skill instructions
            └── SKILL.md
```

### 2. Global System Storage (Fallback)
If no local workspace storage is initialized or if `STATE_MEMORY_MCP_DATA_DIR` is set globally, files reside under the user home directory:

```
~/.state-memory-mcp/
├── data/
│   └── <project-slug>/
│       ├── graph.db
│       ├── graph.db-wal
│       └── backups/
└── backups/                   # Global backup archive
~/.state-memory-mcp-registry.json  # Multi-project slug resolution registry
```

---

## File Permissions & Security

- **Database Directories**: Created with `0o700` (`rwx------`) permissions, restricting directory listing and access to the current system user.
- **Database Files (`graph.db`)**: Created with `0o600` (`rw-------`) permissions to ensure project notes, decisions, and task metadata are non-readable by other unprivileged local users.
- **Path Validation**: Exports, imports, and backup paths are validated against `validatePath()` with symlink canonicalization (`fs.realpathSync()`) to disallow path traversal outside approved project boundaries.

---

## Disclaimer & Limitation of Liability

This software is provided "as is", without warranty of any kind, express or implied. Under no circumstances shall the authors or contributors be liable for any database corruption, Git repository modification, data loss, or other issues resulting from execution. Always backup your database files before performing destructive operations.
