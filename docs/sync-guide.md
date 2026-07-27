# Multi-Machine Synchronization Guide for `@putervision/state-memory-mcp`

`state-memory-mcp` is designed around deterministic, event-sourced state graphs. When working across multiple machines (e.g. laptop, desktop, CI/CD workers, or cloud agents), state memory databases can be synchronized seamlessly.

---

## 1. Supported Sync Patterns

### Pattern A: Centralized Storage Path (`STATE_MEMORY_MCP_DIR`)
If your machines share a network filesystem (NFS, SSHFS, Dropbox, or synced folder), configure the storage directory:
```bash
export STATE_MEMORY_MCP_DIR="/shared/network/path/.state-memory-mcp"
```

### Pattern B: Backup & Merge (`merge_project_db`)
For isolated or air-gapped machines, synchronize databases using deterministic backups and non-destructive merges:

1. **Machine A (Export Backup)**:
   ```bash
   state-memory-mcp backup -p my-project --output /path/to/sync/machine_a.db
   ```
2. **Machine B (Merge Backup)**:
   ```bash
   state-memory-mcp merge -p my-project --source /path/to/sync/machine_a.db
   ```
   *Note*: `merge_project_db` resolves node/edge conflicts by keeping the node with the newer `updated_at` timestamp (Last-Write-Wins CRDT style) and runs graph integrity checks.

### Pattern C: Deterministic Export & Git Tracking (`export_graph`)
Export the project graph to a deterministic JSON file tracked in Git:

1. **Export Graph to Repository**:
   ```bash
   state-memory-mcp export -p my-project --format json --output .state-memory-export.json
   ```
2. **Commit & Push**:
   ```bash
   git add .state-memory-export.json
   git commit -m "chore(memory): sync graph state"
   git push origin main
   ```
3. **Import on Target Machine**:
   ```bash
   state-memory-mcp import -p my-project --input .state-memory-export.json --force
   ```

---

## 2. Integrity Verification Across Machines

After restoring or merging an external database, verify cryptographic audit chain hash continuity:

```typescript
// Via MCP Tool
verify_audit_chain({ project: "my-project" });

// Via CLI
state-memory-mcp audit -p my-project
```

The server verifies SHA-256 event hash linkages to guarantee that no historical events were tampered with during synchronization.
