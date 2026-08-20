/**
 * Embedded template strings for the `state-memory-mcp init` command.
 * These are written/appended to IDE instruction files and MCP config files.
 */

/**
 * Agent instructions content appended to IDE instruction files.
 * Teaches agents how to use state-memory-mcp effectively.
 */
export function getInstructionsTemplate(projectSlug: string): string {
  return `
## State Memory (state-memory-mcp)

This project tracks workflow state, tasks, design decisions, and blockers using \`state-memory-mcp\` with project slug \`"${projectSlug}"\`.

### 1. Priority Order
Before doing any coding or investigation:
1. \`manage_sessions(action: "start")\` — Start a tracking session for full change attribution.
2. \`get_analytics(action: "summary")\` — Run to understand current project state, active branches, and overall progress.
3. \`manage_tasks(action: "next")\` — Query prioritized runnable tasks.
4. \`manage_tasks(action: "find_blockers")\` — Identify any active blockers preventing progress.
5. \`manage_nodes(action: "list")\` — Find pending tasks, past decisions, or milestones.
6. \`query_graph(action: "trace")\` — Trace what depends on or blocks a task.

### 2. When to Write to the Graph
You MUST update the graph as you work:
- **Starting a session**: Always call \`manage_sessions(action: "start", agent_id: "my-agent")\` to track all mutations under a unique session.
- **Starting a new task**: Create a node with \`manage_nodes(action: "create", type: "task", title: "...", session_id: session_id)\`.
- **Making a design or implementation decision**: Document it with \`manage_nodes(action: "create", type: "decision", title: "...", metadata: { "rationale": "..." }, session_id: session_id)\`.
- **Encountering a blocker**: Record the blocker with \`manage_nodes(action: "create", type: "blocker", title: "...", session_id: session_id)\` and connect it using \`manage_edges(action: "add", type: "blocks", source_id: blocker_id, target_id: task_id, session_id: session_id)\`.
- **Adding observation notes**: Atomically log notes using \`manage_nodes(action: "add_note", text: "...", attach_to: node_id)\`.
- **Batch updates**: Bulk update tasks/nodes using \`manage_nodes(action: "batch_update", ids: ["..."], status: "done")\`.
- **Completing a task**: Update status to done using \`manage_tasks(action: "complete", task_id: task_id)\` or \`manage_nodes(action: "update", id: task_id, status: "done")\`.
- **Creating/generating a new file**: Create an artifact node with \`manage_nodes(action: "create", type: "artifact", title: "...", session_id: session_id)\` and connect it using \`manage_edges(action: "add", type: "produces", source_id: task_id, target_id: artifact_id)\`.

### 3. Workflow Pattern
1. **Start of session**: Call \`manage_sessions(action: "start")\` to align and track work, then run \`get_analytics(action: "summary")\`, \`manage_tasks(action: "next")\`, and \`manage_tasks(action: "find_blockers")\`.
2. **Task decomposition**: Decompose user requests into tasks and add them to the graph.
3. **Execution**: Mark tasks as "in_progress", document design decisions as they occur, and log blockers if you hit any obstacles.
4. **Validation & Resolution**: Run \`run_diagnostics(action: "validate")\` to ensure no cycles/orphans/contradictions, mark tasks as "done", document completed artifacts, and resolve blockers. Call \`manage_sessions(action: "end")\` to finalize.

### 4. Codebase Seeding on Initialization
If the project was just initialized or is missing high-level structure (Plans, Milestones, Decisions):
1. **Inspect the Codebase**: Read the README and core files to understand the roadmap and architecture.
2. **Scaffold the Roadmap**: Create a \`plan\` node (e.g., "Project Roadmap") and add \`milestone\` nodes representing key target phases, connecting them using \`part_of\` edges.
3. **Scaffold Architecture**: Create \`decision\` nodes representing core technical choices (e.g., choice of databases, frameworks) and link them to the milestones/tasks using \`decided_in\` edges.
`.trimStart();
}

/**
 * Cursor MCP config template — merged into .cursor/mcp.json
 */
export function getMcpConfigCursor(projectSlug: string) {
  return {
    mcpServers: {
      'state-memory-mcp': {
        command: 'state-memory-mcp',
        args: ['run'],
        env: {
          STATE_MEMORY_MCP_PROJECT: projectSlug,
        },
      },
    },
  };
}

/**
 * VS Code MCP config template — merged into .vscode/mcp.json
 */
export function getMcpConfigVscode(projectSlug: string) {
  return {
    servers: {
      'state-memory-mcp': {
        command: 'state-memory-mcp',
        args: ['run'],
        env: {
          STATE_MEMORY_MCP_PROJECT: projectSlug,
        },
      },
    },
  };
}

/**
 * IDE instruction file definitions.
 * Each entry defines where to write and the marker used for idempotency checks.
 */
export interface InstructionTarget {
  /** Relative path from project root */
  path: string;
  /** Human-readable name for CLI output */
  label: string;
  /** If true, the file is a standalone file (overwrite if not present, skip if contains marker) */
  standalone: boolean;
}

export const INSTRUCTION_TARGETS: InstructionTarget[] = [
  { path: '.gemini/instructions.md', label: 'Gemini', standalone: false },
  { path: '.cursor/rules/state-memory-mcp.mdc', label: 'Cursor', standalone: true },
  { path: '.github/copilot-instructions.md', label: 'GitHub Copilot', standalone: false },
  { path: '.vscode/instructions.md', label: 'VS Code', standalone: false },
  { path: 'CLAUDE.md', label: 'Claude Code', standalone: false },
  { path: '.windsurfrules', label: 'Windsurf', standalone: false },
];

/**
 * Generates the global AGENTS.md rules template content configured for a specific project.
 *
 * @param projectSlug - The project slug identifier.
 * @returns The formatted AGENTS.md rule block.
 */
export function getGlobalRulesTemplate(projectSlug: string): string {
  return `
<!-- state-memory-mcp:start -->
# Workflow State Memory (state-memory-mcp)

This project uses state-memory-mcp with project slug \`"${projectSlug}"\` to track tasks, decisions, blockers, and progress.
ALWAYS update the state graph when performing work.

## Mandatory Workflow
1. **Start of session**: Start a tracking session with \`manage_sessions(action: "start")\`, then run \`get_analytics(action: "summary")\` and \`manage_tasks(action: "next")\` BEFORE any coding.
2. **Before work**: Create or find the task node, set status to \`in_progress\`.
3. **During work**: Log decisions (\`manage_nodes(action: "create", type: "decision")\`), blockers (\`manage_nodes(action: "create", type: "blocker")\`), and observation notes (\`manage_nodes(action: "add_note")\`).
4. **Validation & Resolution**: Run \`run_diagnostics(action: "validate")\` to verify graph health, set task status to \`done\`, create artifact nodes for new files, and conclude the session with \`manage_sessions(action: "end")\`.
5. **Initial Seeding**: If the project has no Plan or Milestone nodes, read the README/codebase and scaffold initial Plan, Milestone, and Decision nodes representing the project roadmap and architecture.

## Priority Order
1. \`manage_sessions\` — track all mutations under a unique session (\`action: "start"\`)
2. \`get_analytics\` — current state and progress (\`action: "summary"\`)
3. \`manage_tasks\` — query prioritized runnable tasks (\`action: "next"\`)
4. \`manage_tasks\` — what's blocking progress (\`action: "find_blockers"\`)
5. \`run_diagnostics\` — check for cycle or logic anomalies (\`action: "validate"\`)
6. \`query_graph\` — understand task relationships (\`action: "trace"\`)
<!-- state-memory-mcp:end -->
`.trimStart();
}

/**
 * Google Antigravity (Gemini) global MCP config template.
 * Merged into ~/.gemini/config/mcp_config.json.
 * Project-agnostic: no env or project slug since this is a global config.
 */
export function getMcpConfigAntigravity() {
  return {
    mcpServers: {
      'state-memory-mcp': {
        command: 'state-memory-mcp',
        args: ['run'],
      },
    },
  };
}

/**
 * Agent skill template for .agents/skills/state-memory-mcp/SKILL.md.
 * Comprehensive reference for agents to use state-memory-mcp effectively.
 */
export function getSkillTemplate(projectSlug: string): string {
  return `---
name: state-memory-mcp
description: Teaches the agent to use the state-memory-mcp MCP server to track workflow state, tasks, decisions, blockers, artifacts, plans, milestones, and their semantic relationships in a persistent graph database.
---

# State Memory (state-memory-mcp) — 13 Consolidated Tools

This project uses \`state-memory-mcp\` with project slug \`"${projectSlug}"\` to provide AI agents with a structured, persistent graph for tracking workflow state.

### 1. Priority Order & Mandatory Checklist
Before doing any coding or investigation, you MUST run this sequence:
1. \`manage_sessions(action: "start")\` — Start a tracking session with an \`agent_id\` for full change attribution.
2. \`get_analytics(action: "summary")\` — Understand current project state, active branches, and overall progress.
3. \`manage_specs(action: "compliance")\` — Check real-time requirement coverage matrix and unfulfilled criteria.
4. \`manage_tasks(action: "next")\` — Query prioritized runnable tasks (sorted by downstream impact and age).
5. \`manage_tasks(action: "find_blockers")\` — Identify any active blockers preventing progress.
6. \`manage_nodes(action: "list")\` — Find pending tasks, past decisions, or milestones.
7. \`query_graph(action: "trace")\` — Trace what depends on or blocks a task.

### 2. Complete 13 Consolidated MCP Tools Reference

| # | Tool Name | Key Actions | Description |
|---|---|---|---|
| 1 | **\`manage_nodes\`** | \`create\`, \`update\`, \`get\`, \`remove\`, \`list\`, \`search\`, \`batch_create\`, \`batch_update\`, \`add_note\` | Graph node CRUD, full-text / TF-IDF search, atomic batch operations, and quick notes. |
| 2 | **\`manage_edges\`** | \`add\`, \`remove\`, \`batch_add\`, \`link_visual\` | Manage typed graph relationships and link tasks/artifacts to visual memory state IDs. |
| 3 | **\`manage_sessions\`** | \`start\`, \`end\`, \`list\`, \`bootstrap\` | Agent tracking sessions, attribution, and single-turn context bootstrapping. |
| 4 | **\`manage_tasks\`** | \`next\`, \`complete\`, \`find_blocked\`, \`find_stale\`, \`find_blockers\`, \`find_similar_blockers\`, \`auto_prune\` | Prioritized task queue, task completion, blocker detection, and automated stale pruning. |
| 5 | **\`manage_snapshots\`** | \`save\`, \`list\`, \`diff\`, \`get_state\`, \`revert\`, \`undo\`, \`get_history\` | Graph checkpoints, visual diffs, point-in-time state reconstruction, and rollbacks. |
| 6 | **\`manage_specs\`** | \`scaffold\`, \`ingest\`, \`export\`, \`compliance\`, \`verify\`, \`decompose_feature\`, \`template\` | Spec-Driven Development (SDD), PRD parsing, acceptance verification, and FDD/RFC templates. |
| 7 | **\`manage_database\`** | \`backup\`, \`restore\`, \`audit\`, \`merge\`, \`branch_diff\`, \`branch_merge\` | SQLite maintenance, physical backups, integrity audits, and Git branch state diffs/merges. |
| 8 | **\`manage_data\`** | \`export_graph\`, \`export_issues\`, \`export_trajectories\`, \`export_joint_trajectories\`, \`export_synergy_metrics\`, \`import_graph\`, \`import_issues\`, \`import_spec\` | Bulk import/export of graph formats, GitHub/Jira issues, ML trajectories, and ROI synergy metrics. |
| 9 | **\`query_graph\`** | \`subgraph\`, \`trace\`, \`raw\`, \`natural_language\` | Graph traversal, upstream/downstream dependency tracing, raw SQL queries, and natural language search. |
| 10 | **\`get_analytics\`** | \`summary\`, \`velocity\`, \`burndown\`, \`value_metrics\`, \`cognitive_load\`, \`critical_path\`, \`context_snapshot\`, \`decision_trail\`, \`find_related_decisions\`, \`contradictions\` | Analytics suite: project overview, velocity, burndown, token ROI, cognitive load, and decision trails. |
| 11 | **\`get_events\`** | \`log\`, \`changelog\`, \`post_mortem\` | Append-only event log queries, session changelogs, and automated session post-mortems. |
| 12 | **\`run_diagnostics\`** | \`validate\`, \`doctor\`, \`check_refs\`, \`audit_chain\`, \`compact\`, \`archive\`, \`prune_events\`, \`version\` | Graph integrity validation, doctor health checks, SHA-256 hash audits, compaction, and archiving. |
| 13 | **\`use_blackboard\`** | \`post\`, \`read\` | Asynchronous multi-agent notice board for inter-agent coordination with TTL expiration. |

### 3. Node Types & Edge Relationships

**Node Types:**
- \`task\` — Incremental items of work or coding TODOs.
- \`decision\` — Architectural choices, pattern selections, and rationale.
- \`artifact\` — Files, documentation, or schemas generated by tasks.
- \`plan\` — High-level development specifications and roadmaps.
- \`milestone\` — Progress checkpoints representing grouped sets of tasks.
- \`blocker\` — Impediments or bugs preventing task completion.
- \`observation\` — Contextual findings, notes, or runtime constraints.
- \`spec\` — Feature specification or PRD document container.
- \`requirement\` — Formal functional or non-functional requirement.
- \`acceptance_criterion\` — Testable acceptance criterion for a requirement.
- \`visual_state\` — Visual state link representing UI layout state.

**Edge Types:**
- \`depends_on\` — Task/milestone depends on another node.
- \`blocks\` — Blocker stalls a task/milestone.
- \`produces\` — Task/milestone generates an artifact.
- \`references\` — Node references documentation or source files.
- \`updates\` / \`contradicts\` — Decision history and conflict tracking.
- \`part_of\` / \`child_of\` — Hierarchical groupings (tasks in milestones, milestones in plans).
- \`implements\` / \`decided_in\` / \`satisfies\` — Links tasks/artifacts to design decisions, plans, or spec requirements.
- \`renders_state\` — Visual memory verification relationship.
- \`blocked_by_visual_state\` — Blocker caused by UI layout failure.
- \`verifies\` / \`verifies_visual_state\` — Verification link connecting tests/evidence to requirements.

### 4. Workflow Patterns

**Session Lifecycle:**
1. \`manage_sessions(action: "start", agent_id: "my-agent")\` → get \`session_id\`
2. Pass \`session_id\` to graph mutations (\`manage_nodes\`, \`manage_edges\`)
3. \`manage_sessions(action: "end", session_id: session_id)\` when work is complete

**Task Decomposition:**
1. Decompose user requests into task nodes with \`manage_nodes(action: "create", type: "task", title: "...")\`
2. Connect related tasks with \`manage_edges(action: "add", type: "depends_on", source_id: A, target_id: B)\`
3. Group under milestones with \`manage_edges(action: "add", type: "part_of", source_id: task, target_id: milestone)\`

**Codebase Seeding (on first init):**
If the project has no Plan or Milestone nodes:
1. Read README and core files to understand the roadmap and architecture.
2. Create a \`plan\` node (e.g., "Project Roadmap") with \`manage_nodes(action: "create", type: "plan", title: "...")\`.
3. Add \`milestone\` nodes for key phases, connecting with \`part_of\` edges.
4. Create \`decision\` nodes for core technical choices, linking with \`decided_in\` edges.

### 5. CLI Commands Reference
\`\`\`bash
state-memory-mcp init          # Initialize in current project
state-memory-mcp init-global   # Re-initialize across all projects in ~/.state-memory-mcp/projects.json
state-memory-mcp run           # Stdio MCP server (used by IDEs)
state-memory-mcp inspect -p X  # ASCII table of project nodes
state-memory-mcp metrics -p X  # ROI and token savings analytics
state-memory-mcp view -p X     # Open 3D graph visualizer in browser
state-memory-mcp export -p X -f [json|dot|mermaid|html]  # Export graph
state-memory-mcp scan-git -p X # Incrementally scan git history
state-memory-mcp backup -p X   # Back up the database
state-memory-mcp audit -p X    # Run integrity checks
state-memory-mcp doctor        # Verify system health and SQLite environment
\`\`\`
`;
}

/**
 * Workspace-level AGENTS.md rules template for .agents/AGENTS.md.
 * Concise rules that tell agents how to use state-memory-mcp automatically.
 */
export function getAgentsMdTemplate(projectSlug: string, withVision: boolean = true): string {
  const visualWorkflowSection = withVision
    ? `
4. **Visual Consistency (Dual Memory)**:
   - For UI / layout tasks, capture visual evidence using \`vision-memory-mcp:analyze_screenshot\` (pass \`trace_id: session_id\` for joint trajectory correlation).
   - Link visual proof via \`manage_edges(action: "link_visual", target_id: task_id, visual_state_id: vs_id, relationship: "renders_state")\`.
   - Log visual blockers via \`manage_edges(action: "link_visual", target_id: blocker_id, visual_state_id: vs_id, relationship: "blocked_by_visual_state")\` or \`vision-memory-mcp:record_outcome(action_type: "blocker")\`.`
    : '';

  const visualToolOrder = withVision
    ? `4. \`manage_edges\` — connect task/artifact nodes to visual states (\`action: "link_visual"\`)\n5. \`manage_tasks\` — what's blocking progress (\`action: "find_blockers"\`)\n6. \`run_diagnostics\` — check for cycle or logic anomalies (\`action: "validate"\`)\n7. \`manage_data\` — export interleaved state + vision logs (\`action: "export_joint_trajectories"\`)`
    : `4. \`manage_tasks\` — what's blocking progress (\`action: "find_blockers"\`)\n5. \`run_diagnostics\` — check for cycle or logic anomalies (\`action: "validate"\`)\n6. \`manage_data\` — export workflow event logs (\`action: "export_graph"\`)`;

  return `
<!-- state-memory-mcp:start -->
# Workflow State Memory (state-memory-mcp)

This project uses \`state-memory-mcp\` with project slug \`"${projectSlug}"\` to track tasks, decisions, blockers, and progress.
ALWAYS update the state graph when performing work.

## Mandatory Workflow
1. **Start of session**: Call \`manage_sessions(action: "start", agent_id: "...")\`, then run \`get_analytics(action: "summary")\` and \`manage_tasks(action: "next")\` BEFORE any coding.
2. **Before work**: Create or find the task node, set status to \`in_progress\`.
3. **During work**: Log decisions (\`manage_nodes(action: "create", type: "decision")\`), blockers (\`manage_nodes(action: "create", type: "blocker")\`), and notes (\`manage_nodes(action: "add_note")\`).${visualWorkflowSection}
5. **After work**: Run \`run_diagnostics(action: "validate")\`, set task status to \`done\` via \`manage_tasks(action: "complete")\`, create artifact nodes, and call \`manage_sessions(action: "end")\`.

## Tool Priority Order
1. \`manage_sessions\` — track all mutations under a unique session (\`action: "start"\`)
2. \`get_analytics\` — current state and progress (\`action: "summary"\`)
3. \`manage_tasks\` — query prioritized runnable tasks (\`action: "next"\`)
${visualToolOrder}

## Node Types
\`task\`, \`decision\`, \`artifact\`, \`plan\`, \`milestone\`, \`blocker\`, \`observation\`, \`spec\`, \`requirement\`, \`acceptance_criterion\`${withVision ? ', `visual_state`' : ''}

## Edge Types
\`depends_on\`, \`blocks\`, \`produces\`, \`references\`, \`updates\`, \`contradicts\`, \`part_of\`, \`child_of\`, \`implements\`, \`decided_in\`${withVision ? ', `renders_state`, `blocked_by_visual_state`, `verifies_visual_state`' : ''}

## Quick Reference
- **Batch updates**: \`manage_nodes(action: "batch_update", ids: [...], status: "done")\`
- **Quick notes**: \`manage_nodes(action: "add_note", text: "...", attach_to: node_id)\`${withVision ? '\n- **Synergy metrics**: `manage_data(action: "export_synergy_metrics")`' : ''}
- **What changed**: \`get_events(action: "changelog", since: "2h")\` or \`get_events(action: "changelog", session_id: "...")\`

> For the complete tool reference and workflow patterns, see the \`state-memory-mcp\` skill in \`.agents/skills/state-memory-mcp/SKILL.md\`.
<!-- state-memory-mcp:end -->
`.trimStart();
}
