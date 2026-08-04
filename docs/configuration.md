# Configuration, Auto-Initialization & Environment Variables

`state-memory-mcp` is designed for zero-friction setup across major AI editors and agents.

---

## 🛠️ Auto-Initialization & Scaffolding

When starting the server via `state-memory-mcp run` or running `state-memory-mcp init`, the engine executes **Auto-Initialization** (`runAutoInit()`):

1. **Local Storage Setup**: Auto-creates `.state-memory-mcp/` directory, database storage, and `.gitignore` preventing database lock collisions.
2. **IDE Configurations**: Scaffolds or updates MCP client configuration files for:
   - **Google Antigravity**: `~/.gemini/antigravity/mcp/state-memory-mcp/`
   - **Claude Code CLI & Desktop**: `.claude/mcp.json` / `claude_desktop_config.json`
   - **Cursor**: `.cursor/mcp.json`
   - **VS Code**: `.vscode/mcp.json`
   - **Windsurf & Roo Code / Cline**: `.windsurf/mcp.json` / `.cline/mcp.json`
3. **Agent Rules & Skills**: Scaffolds `.agents/AGENTS.md` rules and `.agents/skills/state-memory-mcp/SKILL.md` skill instructions so agents immediately know how to use the server.

---

## ⚙️ Environment Variables

| Variable | Description | Default Value |
|---|---|---|
| `STATE_MEMORY_MCP_DIR` | Absolute path to directory where database files are stored. | `.state-memory-mcp/` (Project-local) |
| `STATE_MEMORY_MCP_PROJECT` | Active project slug identifier override. | Auto-resolved from project directory |
| `STATE_MEMORY_MCP_LOG_LEVEL` | Logging verbosity on `stderr` (`debug`, `info`, `warn`, `error`). | `info` |
| `STATE_MEMORY_MCP_DEFAULT_BRANCH` | Fallback branch name if Git cannot be queried on startup. | `main` |
| `STATE_MEMORY_ENCRYPTION_KEY` | Hex or string key for AES-256-GCM metadata payload encryption at rest. | `undefined` (plaintext) |
| `STATE_MEMORY_MAX_DB_BYTES` | Maximum database size safety limit in bytes before rejecting writes. | `5368709120` (5 GB) |
| `STATE_MEMORY_BUSY_TIMEOUT` | SQLite database lock busy timeout in milliseconds. | `5000` (5 seconds) |
| `STATE_MEMORY_WAL_MODE` | SQLite journal mode (`WAL`, `DELETE`, `TRUNCATE`, `PERSIST`, `MEMORY`, `OFF`). | `WAL` |
| `STATE_MEMORY_CYCLE_DETECTION_MODE` | Graph cycle detection policy (`strict` or `best_effort`). | `strict` |
| `STATE_MEMORY_READ_ONLY` | Forces server into read-only access mode (`true`/`false`). | `false` |
| `STATE_MEMORY_AUDIT_ONLY` | Forces server into audit-only access mode (`true`/`false`). | `false` |
| `STATE_MEMORY_ADMIN_KEY` | Secret token required to execute administrative operations like `prune_events`. | `undefined` |
| `STATE_MEMORY_ADMIN_MODE` | Enables administrative mode globally (`true`/`false`). | `false` |
| `STATE_MEMORY_STRICT_AUDIT` | Enforces strict cryptographic event log verification. | `false` |
| `STATE_MEMORY_WEBHOOK_URL` | Webhook HTTP POST endpoint for real-time state change notifications. | `undefined` |
| `STATE_MEMORY_WEBHOOK_SECRET` | Secret token sent as `Authorization: Bearer <secret>` in webhook headers. | `undefined` |
| `STATE_MEMORY_WEBHOOK_TIMEOUT` | Webhook HTTP POST timeout in milliseconds. | `5000` (5 seconds) |
| `STATE_MEMORY_ALLOW_PRIVATE_WEBHOOKS` | Allows dispatching webhooks to local/private network IP addresses. | `false` |
| `ALLOW_PRIVATE_WEBHOOKS` | Alias flag for private network webhook dispatch approval. | `false` |

---

## 💻 Manual MCP Configuration Examples

Running `state-memory-mcp init` automatically creates these configuration files for you. If you prefer to configure manually:

### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "state-memory-mcp": {
      "command": "state-memory-mcp",
      "args": ["run"],
      "env": {
        "STATE_MEMORY_MCP_PROJECT": "your-project-slug"
      }
    }
  }
}
```

### Google Antigravity IDE (`~/.gemini/antigravity/mcp.json` or `.agents/settings.json`)
```json
{
  "mcpServers": {
    "state-memory-mcp": {
      "command": "state-memory-mcp",
      "args": ["run"],
      "env": {
        "STATE_MEMORY_MCP_PROJECT": "your-project-slug"
      }
    }
  }
}
```

### VS Code (`.vscode/mcp.json`)
```json
{
  "servers": {
    "state-memory-mcp": {
      "command": "state-memory-mcp",
      "args": ["run"],
      "env": {
        "STATE_MEMORY_MCP_PROJECT": "your-project-slug"
      }
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "state-memory-mcp": {
      "command": "state-memory-mcp",
      "args": ["run"],
      "env": {
        "STATE_MEMORY_MCP_PROJECT": "your-project-slug"
      }
    }
  }
}
```
