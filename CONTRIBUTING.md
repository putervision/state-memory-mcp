# Contributing to `state-memory-mcp`

Thank you for your interest in contributing to `state-memory-mcp`! This document outlines the guidelines, codebase architecture, and workflow for developing features, fixing bugs, and improving documentation.

---

## Codebase Architecture

The project is structured with a single-responsibility architecture:

- **`src/schema/`**: Defines the data models, TypeScript types, and validation schemas:
  - `src/schema/types.ts`: Domain models (`BaseNode`, `Edge`, `NodeType`, etc.) and database row interfaces (`NodeRow`, `EdgeRow`).
  - `src/schema/schemas.ts`: Zod/custom schemas for validating tool parameters.
- **`src/handlers/`**: Decomposed tool handlers and dispatcher:
  - `src/handlers/node.ts`: Handlers for node CRUD, list, search, and history.
  - `src/handlers/edge.ts`: Handlers for edge add and remove.
  - `src/handlers/graph.ts`: Handlers for subgraphing, backups, raw queries, template scaffolding, and graph validation.
  - `src/handlers/analytics.ts`: Handlers for tracing, blockers, summary, paths, metrics, and staleness detection.
  - `src/handlers/session.ts`: Handlers for session start/end, event logs, rollback, and event pruning.
  - `src/handlers/snapshot.ts`: Handlers for snapshots save/list/diff and trajectory exports.
  - `src/handlers/batch.ts`: Handlers for batch updates and adding observation notes.
  - `src/handlers/helper.ts`: Shared helper functions like schema arguments parsing.
  - `src/handlers/index.ts`: Aggregates and exports the unified `toolHandlers` dispatch map.
- **`src/engine/`**: The core domain engine:
  - `src/engine/db.ts`: Manages project databases paths, connection caching, and path traversal validation.
  - `src/engine/graph.ts`: Core CRUD operations for nodes.
  - `src/engine/edges.ts`: CRUD operations for edges, including circular dependency detection.
  - `src/engine/queries.ts`: Search, full-text indexing, and pagination.
  - `src/engine/analytics/`: Decomposed topological sorting, path tracking, decision trails, critical paths, blast radius/impact, contradictions, value metrics, and transitively blocked task algorithms.
  - `src/engine/row-mappers.ts`: Maps SQLite database rows to typed domain models securely.
  - `src/engine/scaffolder.ts`: Automatically seeds workflows and handles static roadmap/tech-stack discovery.
  - `src/engine/git-scanner.ts`: Incrementally scans git history to map observations, tasks, and file modifications.
  - `src/engine/export.ts`: Serializes the graph to JSON, DOT, Mermaid, or interactive 3D WebGL HTML pages.
  - `src/engine/import.ts`: Performs project bulk loads with verification flags.
  - `src/engine/backup.ts`: Handles online database backup/restore operations and checksum verification.
  - `src/engine/audit.ts`: Audits database structure, foreign key constraints, orphaned edges, cycles, and logical contradictions.
  - `src/engine/merge.ts`: Performs two-database merges, conflict resolution, and dependency cycle validation.
  - `src/engine/query-raw.ts`: Executes read-only SQL queries with syntax sanitization.
  - `src/engine/batch.ts`: Core engine for atomic batch node updates.
  - `src/engine/work-queue.ts`: Core engine for prioritizing runnable tasks.
  - `src/engine/changeset.ts`: Core engine for diffing session changeset updates.
  - `src/engine/staleness.ts`: Core engine for inactivity staleness detection.
  - `src/engine/validate.ts`: Core engine for logical graph validation.
- **`src/cli/`**: The Command Line Interface:
  - `src/cli/init.ts`: Bootstraps project settings, Git configurations, instructions, and MCP settings.
  - `src/cli/templates.ts`: Embedded rule instructions and template mappings.
  - `src/cli/helper.ts`: Shared CLI utility classes (like Table formatting).
  - `src/cli/commands/`: Decomposed CLI subcommands (inspect, scan-git, metrics, view, export, import, backup, restore, audit, merge, sessions, events, export-trajectories).
- **`src/utils/`**: Shared helper functions (logger, versioning, id-generators, time-utilities).
- **`src/server.ts`**: The Model Context Protocol (MCP) server definition. Imports decomposed tool handlers and registers prompt/resource endpoints.
- **`src/index.ts`**: The main entry point starting the MCP server with graceful shutdown handlers.
- **`src/cli.ts`**: The command-line parser entry point delegating to subcommand actions.

---

## How to Add a New Tool

To introduce a new Model Context Protocol tool to `state-memory-mcp`, follow these steps:

### 1. Define the Parameter Type and Schema
Open `src/schema/schemas.ts` and define the parameters validation schema:
```typescript
export const MyNewToolSchema = z.object({
  project: z.string().optional(),
  target_id: z.string(),
  force: z.boolean().optional(),
});

export type MyNewToolParams = z.infer<typeof MyNewToolSchema>;
```

### 2. Implement the Engine Logic
Create or add a static method under the appropriate class in `src/engine/`:
```typescript
// src/engine/graph.ts or new engine file
export class GraphEngine {
  static performMyAction(params: MyNewToolParams): MyActionResult {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);
    // ... implement logic
    return result;
  }
}
```

### 3. Register the Tool in the MCP Server
Open `src/server.ts` and perform two additions:

1. **List the tool** in the `ListToolsRequestSchema` response array:
```typescript
      {
        name: 'my_new_tool',
        description: 'Perform my custom action in the graph.',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Optional project identifier.' },
            target_id: { type: 'string', description: 'The target node identifier.' },
            force: { type: 'boolean', description: 'Force execution flag.' }
          },
          required: ['target_id'],
        },
      },
```

2. **Register the handler** in the `toolHandlers` mapping object:
```typescript
  my_new_tool: (args) => {
    const data = parseArgs(MyNewToolSchema, args);
    return GraphEngine.performMyAction(data);
  },
```

### 4. Write Tests and Build
1. Write a new unit test file in `tests/engine/` or append tests to verify the tool's behavior.
2. Verify that everything builds, lints, and compiles without warnings:
```bash
npm run lint
npx tsc --noEmit
npm run build
npm test
```

---

## Submission Guidelines

1. **Create a Branch**: Create a descriptive feature branch from the `main` branch.
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Commit Conventions**: We follow conventional commit styles (e.g. `feat: add my_new_tool`, `fix: handle empty backups`).
3. **Write Tests**: Ensure any new features or bug fixes are covered by appropriate Vitest unit/integration tests in the `tests/` directory.
4. **Build & Verify**: Confirm that the code builds and linting and formatting checks pass.
5. **Open a Pull Request**: Submit your pull request to the `main` branch of the upstream repository.
