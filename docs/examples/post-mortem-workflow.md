# 📝 Post-Mortem & Observability Workflow Example

This guide demonstrates how an AI agent uses `@putervision/state-memory-mcp` to generate post-mortem summaries from session ledgers, trace decision lineages, and export joint multimodal trajectories for offline model fine-tuning.

---

## Workflow Steps

### Step 1: Generate Post-Mortem Report from Session Ledger
Synthesize a post-mortem document summarizing all mutations, blockers, and decisions during an agent session:

```typescript
get_events({
  action: "post_mortem",
  project: "my-app",
  session_id: "sess_01KYW801"
});
// Generates structured markdown summary of timeline, root causes, decisions made, and artifacts produced
```

### Step 2: Trace Decision Lineage (`get_analytics:decision_trail`)
Inspect the historical sequence of design decisions and updates leading to the current architecture:

```typescript
get_analytics({
  action: "decision_trail",
  project: "my-app",
  node_id: "decision_auth_strategy_01"
});
```

### Step 3: Export Multimodal Trajectories for Fine-Tuning
Export JSONL trajectory logs combining state graph mutations and `vision-memory-mcp` layout transitions:

```typescript
manage_data({
  action: "export_joint_trajectories",
  project: "my-app",
  session_id: "sess_01KYW801"
});
```
