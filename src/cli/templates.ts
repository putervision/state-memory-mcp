/**
 * Embedded template strings for the `state-graph-mcp init` command.
 * These are written/appended to IDE instruction files and MCP config files.
 */

/**
 * Agent instructions content appended to IDE instruction files.
 * Teaches agents how to use state-graph-mcp effectively.
 */
export const INSTRUCTIONS_TEMPLATE = `
## State Graph (state-graph-mcp)

This project tracks workflow state, tasks, design decisions, and blockers using \`state-graph-mcp\`.

### 1. Priority Order
Before doing any coding or investigation:
1. \`get_project_summary\` — Always run this first to understand current project state, active branches, and overall progress.
2. \`find_blockers\` — Identify any active blockers preventing progress.
3. \`list_nodes\` — Find pending tasks, past decisions, or milestones.
4. \`trace_dependencies\` — Trace what depends on or blocks a task.

### 2. When to Write to the Graph
You MUST update the graph as you work:
- **Starting a new task**: Create a node with \`add_node(type: "task", title: "...")\`.
- **Making a design or implementation decision**: Document it with \`add_node(type: "decision", title: "...", metadata: { "rationale": "..." })\`.
- **Encountering a blocker**: Record the blocker with \`add_node(type: "blocker", ...)\` and connect it to the blocked task using \`add_edge(type: "blocks", source_id: blocker_id, target_id: task_id)\`.
- **Completing a task**: Update the status to done using \`update_node(id: task_id, status: "done")\`.
- **Creating/generating a new file**: Create an artifact node with \`add_node(type: "artifact", ...)\` and connect it using \`add_edge(type: "produces")\`.

### 3. Workflow Pattern
1. **Start of session**: Run \`get_project_summary\` and \`find_blockers\` to align on current status.
2. **Task decomposition**: Decompose user requests into tasks and add them to the graph.
3. **Execution**: Mark tasks as "in_progress", document design decisions as they occur, and log blockers if you hit any obstacles.
4. **Resolution**: Mark tasks as "done", document completed artifacts, and resolve blockers.

### 4. Codebase Seeding on Initialization
If the project was just initialized or is missing high-level structure (Plans, Milestones, Decisions):
1. **Inspect the Codebase**: Read the README and core files to understand the roadmap and architecture.
2. **Scaffold the Roadmap**: Create a \`plan\` node (e.g., "Project Roadmap") and add \`milestone\` nodes representing key target phases, connecting them using \`part_of\` edges.
3. **Scaffold Architecture**: Create \`decision\` nodes representing core technical choices (e.g., choice of databases, frameworks) and link them to the milestones/tasks using \`decided_in\` edges.
`.trimStart();

/**
 * Cursor MCP config template — merged into .cursor/mcp.json
 */
export const MCP_CONFIG_CURSOR = {
  mcpServers: {
    'state-graph-mcp': {
      command: 'state-graph-mcp',
      args: ['run'],
    },
  },
};

/**
 * VS Code MCP config template — merged into .vscode/mcp.json
 */
export const MCP_CONFIG_VSCODE = {
  servers: {
    'state-graph-mcp': {
      command: 'state-graph-mcp',
      args: ['run'],
    },
  },
};

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
  { path: '.cursor/rules/state-graph-mcp.mdc', label: 'Cursor', standalone: true },
  { path: '.github/copilot-instructions.md', label: 'GitHub Copilot', standalone: false },
  { path: '.vscode/instructions.md', label: 'VS Code', standalone: false },
  { path: 'CLAUDE.md', label: 'Claude Code', standalone: false },
  { path: '.windsurfrules', label: 'Windsurf', standalone: false },
];

export const GLOBAL_RULES_TEMPLATE = `
<!-- state-graph-mcp:start -->
# Workflow State Graph (state-graph-mcp)

This project uses state-graph-mcp to track tasks, decisions, blockers, and progress.
ALWAYS update the state graph when performing work.

## Mandatory Workflow
1. **Start of session**: Run \`get_project_summary\` then \`find_blockers\` BEFORE any coding
2. **Before work**: Create or find the task node, set status to \`in_progress\`
3. **During work**: Log decisions (\`add_node type: decision\`) and blockers (\`add_node type: blocker\`)
4. **After work**: Set task status to \`done\`, create artifact nodes for new files
5. **Initial Seeding**: If the project has no Plan or Milestone nodes, read the README/codebase and scaffold initial Plan, Milestone, and Decision nodes representing the project roadmap and architecture.

## Priority Order
1. \`get_project_summary\` — current state and progress
2. \`find_blockers\` — what's blocking progress
3. \`list_nodes\` — find pending tasks
4. \`trace_dependencies\` — understand task relationships
<!-- state-graph-mcp:end -->
`.trimStart();

