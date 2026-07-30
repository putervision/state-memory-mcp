# 🚀 Feature Implementation Workflow Example (Spec-Driven Development)

This guide demonstrates how an AI coding agent leverages `@putervision/state-memory-mcp` for end-to-end Spec-Driven Development (SDD) during a feature implementation task.

---

## Workflow Steps

### Step 1: Initialize Session & Scaffold Feature Spec
Start a tracked session and scaffold a feature spec:

```typescript
// 1. Start Session
start_session({ agent_id: "coder-agent-1", metadata: { feature: "user-auth" } });
// Returns: session_id = "sess_01KYW801"

// 2. Scaffold Spec
scaffold_spec({ title: "User Authentication Flow" });
// Scaffolds .specs/user-authentication-flow.md and ingests into memory graph
```

### Step 2: Query Requirement Coverage & Task Queue
Inspect spec requirements and prioritized tasks:

```typescript
// 1. Get Spec Compliance Matrix
get_spec_compliance({ project: "my-app" });

// 2. Fetch Next Tasks
next_tasks({ limit: 5 });
```

### Step 3: Implement & Link Visual State Proof
As coding progresses, link UI states captured by `vision-memory-mcp`:

```typescript
// Link visual state layout screenshot to task verification
link_visual_state({
  project: "my-app",
  target_id: "node_task_01KYW802",
  visual_state_id: "vs_login_screen_01",
  relationship: "verifies_visual_state"
});
```

### Step 4: Atomically Complete Task & Generate Artifact
Complete the task, create an artifact node, and create a `produces` edge in a single call:

```typescript
complete_task({
  project: "my-app",
  task_id: "node_task_01KYW802",
  artifact_title: "src/auth/jwt-strategy.ts",
  artifact_metadata: { language: "typescript", coverage: 98.4 }
});
```
