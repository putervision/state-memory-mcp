# 🐛 Debugging & Blocker Resolution Workflow Example

This guide demonstrates how an AI agent uses `@putervision/state-memory-mcp` to record blockers, perform semantic TF-IDF RAG searches over historical resolutions, and cleanly backtrack state during debugging.

---

## Workflow Steps

### Step 1: Record Active Blocker & Connect to Task
When encountering a build error or failing integration test, log a blocker node:

```typescript
// 1. Add Blocker Node
add_node({
  type: "blocker",
  title: "Database connection pool timeout under load",
  status: "active",
  metadata: { error_code: "ECONNRESET", max_connections: 10 }
});
// Returns: blocker_id = "blocker_01KYW901"

// 2. Connect Blocker to Stalled Task
add_edge({
  source_id: "blocker_01KYW901",
  target_id: "task_01KYW900",
  type: "blocks"
});
```

### Step 2: Semantic Blocker RAG Search (`find_similar_blockers`)
Query historical resolved blockers and observations to find matching resolution patterns:

```typescript
find_similar_blockers({
  project: "my-app",
  query: "database pool timeout ECONNRESET connection limit",
  limit: 3
});
// Returns matching historical blockers with past resolution notes and metadata
```

### Step 3: Log Observation Note & Update Blocker Status
Log technical findings atomically and resolve the blocker:

```typescript
// 1. Log Observation Note
add_note({
  text: "Increased SQLite busy_timeout to 5000ms and configured WAL mode connection pooling.",
  attach_to: "task_01KYW900"
});

// 2. Resolve Blocker
update_node({
  id: "blocker_01KYW901",
  status: "resolved"
});
```

### Step 4: Revert State graph if Unsafe Recovery (`traceback_to_node`)
If a trial fix corrupts execution context, revert to a prior validated node:

```typescript
traceback_to_node({
  project: "my-app",
  target_node_id: "task_01KYW850",
  reason: "Trial migration script failed; resetting execution state."
});
```
