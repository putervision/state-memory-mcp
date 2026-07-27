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
1. \`start_session\` — Start a tracking session for full change attribution.
2. \`get_project_summary\` — Run to understand current project state, active branches, and overall progress.
3. \`next_tasks\` — Query prioritized runnable tasks.
4. \`find_blockers\` — Identify any active blockers preventing progress.
5. \`list_nodes\` — Find pending tasks, past decisions, or milestones.
6. \`trace_dependencies\` — Trace what depends on or blocks a task.

### 2. When to Write to the Graph
You MUST update the graph as you work:
- **Starting a session**: Always call \`start_session(agent_id: "my-agent")\` to track all mutations under a unique session.
- **Starting a new task**: Create a node with \`add_node(type: "task", title: "...", session_id: session_id)\`.
- **Making a design or implementation decision**: Document it with \`add_node(type: "decision", title: "...", metadata: { "rationale": "..." }, session_id: session_id)\`.
- **Encountering a blocker**: Record the blocker with \`add_node(type: "blocker", ..., session_id: session_id)\` and connect it using \`add_edge(type: "blocks", source_id: blocker_id, target_id: task_id, session_id: session_id)\`.
- **Adding observation notes**: Atomically log notes using \`add_note(text: "...", attach_to: node_id)\`.
- **Batch updates**: Bulk update tasks/nodes using \`batch_update(ids: ["..."], status: "done")\`.
- **Completing a task**: Update status to done using \`update_node(id: task_id, status: "done", session_id: session_id)\`.
- **Creating/generating a new file**: Create an artifact node with \`add_node(type: "artifact", ..., session_id: session_id)\` and connect it using \`add_edge(type: "produces", ..., session_id: session_id)\`.

### 3. Workflow Pattern
1. **Start of session**: Call \`start_session\` to align and track work, then run \`get_project_summary\`, \`next_tasks\`, and \`find_blockers\`.
2. **Task decomposition**: Decompose user requests into tasks and add them to the graph.
3. **Execution**: Mark tasks as "in_progress", document design decisions as they occur, and log blockers if you hit any obstacles.
4. **Validation & Resolution**: Run \`validate_graph\` to ensure no cycles/orphans/contradictions, mark tasks as "done", document completed artifacts, and resolve blockers. Call \`end_session\` to finalize.

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
1. **Start of session**: Start a tracking session with \`start_session\`, then run \`get_project_summary\` and \`next_tasks\` BEFORE any coding.
2. **Before work**: Create or find the task node, set status to \`in_progress\`.
3. **During work**: Log decisions (\`add_node type: decision\`), blockers (\`add_node type: blocker\`), and observation notes (\`add_note\`).
4. **Validation & Resolution**: Run \`validate_graph\` to verify graph health, set task status to \`done\`, create artifact nodes for new files, and conclude the session with \`end_session\`.
5. **Initial Seeding**: If the project has no Plan or Milestone nodes, read the README/codebase and scaffold initial Plan, Milestone, and Decision nodes representing the project roadmap and architecture.

## Priority Order
1. \`start_session\` — track all mutations under a unique session
2. \`get_project_summary\` — current state and progress
3. \`next_tasks\` — query prioritized runnable tasks
4. \`find_blockers\` — what's blocking progress
5. \`validate_graph\` — check for cycle or logic anomalies
6. \`trace_dependencies\` — understand task relationships
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

# State Memory (state-memory-mcp)

This project uses \`state-memory-mcp\` with project slug \`"${projectSlug}"\` to provide AI agents with a structured, persistent graph for tracking workflow state.

### 1. Priority Order & Mandatory Checklist
Before doing any coding or investigation, you MUST run this sequence:
1. \`start_session\` — Start a tracking session with an \`agent_id\` for full change attribution.
2. \`get_project_summary\` — Understand current project state, active branches, and overall progress.
3. \`get_spec_compliance\` — Check real-time requirement coverage matrix and unfulfilled criteria.
4. \`next_tasks\` — Query prioritized runnable tasks (sorted by downstream impact and age).
5. \`find_blockers\` — Identify any active blockers preventing progress.
6. \`list_nodes\` — Find pending tasks, past decisions, or milestones.
7. \`trace_dependencies\` — Trace what depends on or blocks a task.

### 2. Complete 58 Tool Reference

#### Node CRUD (4)
| Tool | Key Inputs | Description |
|------|------------|-------------|
| \`add_node\` | \`type\`, \`title\`, \`status?\`, \`metadata?\`, \`tags?\` | Create a new node (task, decision, artifact, plan, blocker, milestone, observation). |
| \`update_node\` | \`id\`, \`title?\`, \`status?\`, \`metadata?\`, \`tags?\` | Update properties of an existing node. |
| \`get_node\` | \`id\` | Retrieve a node by its unique ID with connected edges. |
| \`remove_node\` | \`id\` | Delete a node and its connected edges. |

#### Edge Relationships (2)
| Tool | Key Inputs | Description |
|------|------------|-------------|
| \`add_edge\` | \`source_id\`, \`target_id\`, \`type\` | Create a typed relationship (\`depends_on\`, \`blocks\`, \`produces\`, \`references\`, \`updates\`, \`contradicts\`, \`part_of\`, \`child_of\`, \`implements\`, \`decided_in\`, \`extends\`, \`modifies\`, \`renders_state\`). |
| \`remove_edge\` | \`source_id\`, \`target_id\`, \`type\` | Delete an edge relationship between two nodes. |

#### Discovery & Search (3)
| Tool | Key Inputs | Description |
|------|------------|-------------|
| \`list_nodes\` | \`type?\`, \`status?\`, \`tags?\`, \`limit?\` | List nodes with optional filters and compact mode. |
| \`search_nodes\` | \`query\`, \`type?\`, \`status?\`, \`algorithm?\` | Full-text search across titles and metadata using FTS5 or TF-IDF vector similarity. |
| \`get_subgraph\` | \`root_id\`, \`depth?\` | Get a subgraph starting from a root node up to depth N. |

#### Dependency & Analysis (8)
| Tool | Key Inputs | Description |
|------|------------|-------------|
| \`trace_dependencies\` | \`node_id\`, \`direction\`, \`depth?\` | Trace dependency chains upstream or downstream. |
| \`find_blockers\` | \`node_id?\`, \`include_transitive?\` | Find active blockers and affected tasks. |
| \`critical_path\` | \`milestone_id\` | Compute the longest chain of unfinished tasks blocking a milestone. |
| \`impact_analysis\` | \`node_id\` | Calculate the downstream blast radius if a node changes. |
| \`detect_contradictions\` | \`project\` | Audit for logical flaws (e.g., done tasks with active blockers). |
| \`decision_trail\` | \`node_id\` | Trace the historical lineage of decisions and updates. |
| \`find_related_decisions\` | \`artifact_id\` | Find decisions related to an artifact or node. |
| \`find_blocked_tasks\` | \`decision_id\` | Find tasks blocked by an incomplete decision. |

#### Project Overview (4)
| Tool | Key Inputs | Description |
|------|------------|-------------|
| \`get_project_summary\` | \`project\` | Overview of node counts, status breakdown, active blockers, recent decisions, and progress percentage. |
| \`get_context_snapshot\` | \`project\` | High-level context snapshot combining summary, active blockers, and pending tasks. |
| \`value_metrics\` | \`project\` | ROI, productivity, and token savings analytics. |
| \`scaffold_template\` | \`template\`, \`name\` | Generate pre-built feature (fdd) or decision (rfc) workflow templates. |

#### Agent QoL & Compound Tools (10)
| Tool | Key Inputs | Description |
|------|------------|-------------|
| \`batch_update\` | \`ids\`, \`status?\`, \`metadata?\`, \`tags?\` | Atomic batch updates of status, metadata, or tags across multiple nodes. |
| \`next_tasks\` | \`limit?\` | Prioritized runnable task queue sorted by downstream impact and age. |
| \`what_changed\` | \`since?\`, \`session_id?\` | Graph changeset diff since a session start or timestamp. |
| \`get_stale_nodes\` | \`days?\`, \`type?\` | Find idle/untouched nodes older than a threshold. |
| \`validate_graph\` | \`checks?\`, \`auto_fix?\` | Topological and logic validation (cycles, orphans, empty milestones, dangling edges). |
| \`add_note\` | \`text\`, \`attach_to?\` | Atomically log an observation note with optional context link. |
| \`bootstrap_session\` | \`agent_id?\`, \`task_limit?\` | Single-turn session start, context snapshot, and next unblocked tasks query. |
| \`complete_task\` | \`task_id\`, \`artifact_title?\` | Single-turn task completion, optional artifact creation, and produces edge creation. |
| \`batch_create_nodes\` | \`nodes\` | Atomically create multiple nodes in a single transaction with search index sync. |
| \`batch_add_edges\` | \`edges\` | Atomically add multiple edges with cycle detection and transaction rollback. |

#### Session, Audit & Cognitive Memory (11)
| Tool | Key Inputs | Description |
|------|------------|-------------|
| \`start_session\` | \`agent_id?\`, \`metadata?\` | Start a tracked session. Returns \`session_id\` to stamp all mutations. |
| \`end_session\` | \`session_id\` | Conclude an active session. |
| \`list_sessions\` | \`project\` | List active and completed agent sessions. |
| \`get_event_log\` | \`node_id?\`, \`event_type?\`, \`session_id?\` | Query the append-only event ledger with filters. |
| \`get_node_history\` | \`id\` | View every mutation event for a specific node in chronological order. |
| \`undo_last\` | \`id\` | Revert the last mutation on a node by restoring \`before_state\`. |
| \`prune_events\` | \`older_than\`, \`dry_run?\` | Prune old event log entries while preserving latest entity state (requires admin privilege). |
| \`verify_audit_chain\` | \`project\` | Mathematically verify SHA-256 cryptographic hash chain integrity across event log history. |
| \`subscribe_context_changes\` | \`project\` | Subscribe to push notifications for project state changes. |
| \`traceback_to_node\` | \`node_id\` | Perform reverse path traversal from an outcome back to root decisions/tasks. |
| \`get_cognitive_load\` | \`project\` | Compute active working context complexity and cognitive load metrics for an agent session. |

#### Snapshots & Export (6)
| Tool | Key Inputs | Description |
|------|------------|-------------|
| \`save_snapshot\` | \`name\`, \`description?\` | Save the current graph state as a named checkpoint. |
| \`list_snapshots\` | \`project\` | List all saved checkpoints. |
| \`diff_snapshots\` | \`snapshot_a\`, \`snapshot_b\` | Compare two checkpoints for added/removed/updated nodes and edges. |
| \`export_graph\` | \`format?\` | Export graph data (JSON, DOT, Mermaid, HTML). |
| \`import_graph\` | \`nodes\`, \`edges\`, \`force?\` | Bulk import nodes and edges from JSON. |
| \`export_trajectories\` | \`session_id?\` | Export transition sequences in JSONL format for fine-tuning. |

#### Spec-Driven Development (5)
| Tool | Key Inputs | Description |
|------|------------|-------------|
| \`ingest_spec\` | \`file_path\`, \`format?\` | Parse and ingest Markdown PRD, OpenSpec, or Gherkin BDD specs into graph nodes. |
| \`export_spec\` | \`spec_id\`, \`format?\` | Export graph-managed specification node and child requirements back to Markdown/Gherkin text. |
| \`get_spec_compliance\` | \`project\` | Calculate real-time Spec Compliance matrix, requirement coverage ratio, and unfulfilled criteria. |
| \`scaffold_spec\` | \`title?\` | Scaffold a standard feature specification template in \`.specs/\` and ingest into memory. |
| \`verify_requirement\` | \`criterion_id\`, \`status\` | Mark acceptance criteria as verified/failing/skipped with optional observation proof link. |

#### Database Administration (5)
| Tool | Key Inputs | Description |
|------|------------|-------------|
| \`query_graph\` | \`sql\`, \`params?\` | Safe read-only SELECT queries against allowed table schemas. |
| \`backup_project_db\` | \`output_path?\` | Back up the project database to a SQLite file. |
| \`restore_project_db\` | \`backupPath\` | Restore from a backup (destructive overwrite). |
| \`audit_project_db\` | \`project\` | Run physical integrity, foreign key, cycle, and contradiction checks. |
| \`merge_project_db\` | \`sourcePath\`, \`force?\` | Merge an external database into the current project database. |

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

**Edge Types:**
- \`depends_on\` — Task/milestone depends on another node.
- \`blocks\` — Blocker stalls a task/milestone.
- \`produces\` — Task/milestone generates an artifact.
- \`references\` — Node references documentation or source files.
- \`updates\` / \`contradicts\` — Decision history and conflict tracking.
- \`part_of\` / \`child_of\` — Hierarchical groupings (tasks in milestones, milestones in plans).
- \`implements\` / \`decided_in\` / \`satisfies\` — Links tasks/artifacts to design decisions, plans, or spec requirements.
- \`extends\` / \`modifies\` — Git commit trace relationships.
- \`renders_state\` — Visual memory verification relationship.
- \`verifies\` — Verification link connecting tests/observations to acceptance criteria.

### 4. Workflow Patterns

**Session Lifecycle:**
1. \`start_session(agent_id: "my-agent")\` → get \`session_id\`
2. Pass \`session_id\` to all \`add_node\`, \`update_node\`, \`add_edge\` calls
3. \`end_session(session_id)\` when work is complete

**Task Decomposition:**
1. Decompose user requests into task nodes with \`add_node(type: "task")\`
2. Connect related tasks with \`add_edge(type: "depends_on")\`
3. Group under milestones with \`add_edge(type: "part_of")\`

**Codebase Seeding (on first init):**
If the project has no Plan or Milestone nodes:
1. Read README and core files to understand the roadmap and architecture.
2. Create a \`plan\` node (e.g., "Project Roadmap").
3. Add \`milestone\` nodes for key phases, connecting with \`part_of\` edges.
4. Create \`decision\` nodes for core technical choices, linking with \`decided_in\` edges.

### 5. CLI Commands Reference
\`\`\`bash
state-memory-mcp init          # Initialize in current project
state-memory-mcp run           # Start the MCP server
state-memory-mcp inspect -p X  # ASCII table of project nodes
state-memory-mcp metrics -p X  # ROI and token savings analytics
state-memory-mcp view -p X     # Open 3D graph visualizer in browser
state-memory-mcp export -p X -f [json|dot|mermaid|html]  # Export graph
state-memory-mcp scan-git -p X # Incrementally scan git history
state-memory-mcp backup -p X   # Back up the database
state-memory-mcp audit -p X    # Run integrity checks
\`\`\`
`;
}

/**
 * Workspace-level AGENTS.md rules template for .agents/AGENTS.md.
 * Concise rules that tell agents how to use state-memory-mcp automatically.
 */
export function getAgentsMdTemplate(projectSlug: string): string {
  return `
<!-- state-memory-mcp:start -->
# Workflow State Memory (state-memory-mcp)

This project uses \`state-memory-mcp\` with project slug \`"${projectSlug}"\` to track tasks, decisions, blockers, and progress.
ALWAYS update the state graph when performing work.

## Mandatory Workflow
1. **Start of session**: Call \`start_session(agent_id: "...")\`, then run \`get_project_summary\` and \`next_tasks\` BEFORE any coding.
2. **Before work**: Create or find the task node, set status to \`in_progress\`.
3. **During work**: Log decisions (\`add_node type: decision\`), blockers (\`add_node type: blocker\`), and notes (\`add_note\`).
4. **After work**: Run \`validate_graph\`, set task status to \`done\`, create artifact nodes, and call \`end_session\`.
5. **Initial Seeding**: If the project has no Plan or Milestone nodes, read the codebase and scaffold Plan, Milestone, and Decision nodes.

## Tool Priority Order
1. \`start_session\` — track all mutations under a unique session
2. \`get_project_summary\` — current state and progress
3. \`next_tasks\` — query prioritized runnable tasks
4. \`find_blockers\` — what's blocking progress
5. \`validate_graph\` — check for cycle or logic anomalies
6. \`trace_dependencies\` — understand task relationships

## Node Types
\`task\`, \`decision\`, \`artifact\`, \`plan\`, \`milestone\`, \`blocker\`, \`observation\`

## Edge Types
\`depends_on\`, \`blocks\`, \`produces\`, \`references\`, \`updates\`, \`contradicts\`, \`part_of\`, \`child_of\`, \`implements\`, \`decided_in\`

## Quick Reference
- **Batch updates**: \`batch_update(ids: [...], status: "done")\`
- **Quick notes**: \`add_note(text: "...", attach_to: node_id)\`
- **What changed**: \`what_changed(since: "2h")\` or \`what_changed(session_id: "...")\`
- **Stale nodes**: \`get_stale_nodes(days: 7)\`

> For the complete tool reference and workflow patterns, see the \`state-memory-mcp\` skill in \`.agents/skills/state-memory-mcp/SKILL.md\`.
<!-- state-memory-mcp:end -->
`.trimStart();
}
