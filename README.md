# @putervision/state-memory-mcp

[![npm version](https://img.shields.io/npm/v/@putervision/state-memory-mcp.svg)](https://www.npmjs.com/package/@putervision/state-memory-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@putervision/state-memory-mcp.svg)](https://www.npmjs.com/package/@putervision/state-memory-mcp)
[![CI](https://github.com/putervision/state-memory-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/putervision/state-memory-mcp/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D18.18.0-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Website](https://img.shields.io/badge/Website-statememorymcp.com-6366f1.svg)](https://statememorymcp.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/putervision/state-memory-mcp/blob/main/LICENSE)

`@putervision/state-memory-mcp` is a zero-infrastructure, deterministic Model Context Protocol (MCP) server that provides AI coding assistants (such as Cursor, Claude Code, Gemini, or Copilot) with a structured, persistent SQLite graph for tracking workflow state—tasks, decisions, artifacts, plans, blockers, and their semantic relationships.

🌐 **Official Documentation & Website**: [statememorymcp.com](https://statememorymcp.com)

---

## ⚡ Quick Start & Installation

> **Prerequisites**: Node.js **>= 18.18.0**

```bash
# 1. Install globally
npm install -g @putervision/state-memory-mcp

# 2. Navigate to your project directory
cd your-project

# 3. Initialize state-memory-mcp
# Creates .state-memory-mcp/, updates .gitignore, registers project,
# and scaffolds IDE instructions and MCP configs for Cursor, Claude, VS Code, Windsurf, etc.
state-memory-mcp init

# Done! Restart your IDE or Agent Manager to activate.
```

### Alternative Options
```bash
# Run directly via binary (after global install)
state-memory-mcp run

# Re-initialize across all registered workspace projects
state-memory-mcp init-global
```

---

## 🌟 Key Highlights

- **🧠 Deterministic State Memory**: Zero LLM in the loop for memory operations; fast, deterministic SQLite graph traversals.
- **⚡ 13 Production-Grade Consolidated MCP Tools**: Full CRUD, relationship linking, DAG cycle checks, FTS5 search, TF-IDF RAG, time-travel history rollback, Spec-Driven Development, and auto-healing validation.
- **📉 Efficient Context Management**: Offloads context to a local SQLite database, helping reduce prompt context bloat and context window usage.
- **🚀 67%–74% Latency Reduction**: Eliminates multi-step file scanning loops; agents retrieve unblocked tasks and blockers in milliseconds.
- **🤝 Multi-Agent Blackboard**: Shared Context Store allowing parallel subagents to publish decisions, tasks, and blocker updates safely.
- **🎨 Interactive 3D Visualizer**: Browser-based dark-mode 3D WebGL force-directed graph visualizer (`state-memory-mcp view`).
- **🔗 Dual-MCP Synergy**: Pair with [`@putervision/vision-memory-mcp`](https://github.com/putervision/vision-memory-mcp) for visual state caching, perceptual hashing, and cryptographic multimodal evidence packs.
- **🛡️ 100% Local & Private**: Local-first architecture; all state stays inside `.state-memory-mcp/` in your workspace.

---

## 🛠️ MCP Tool Suite

`@putervision/state-memory-mcp` provides **13 production-grade consolidated MCP tools** organized across 5 core workflow domains:

- **Graph & Relationships**: `manage_nodes` (node CRUD, FTS5/TF-IDF vector search, atomic batch mutations, observation notes), `manage_edges` (typed DAG links, multimodal visual state linking).
- **Task Execution & Work Queue**: `manage_tasks` (topological dependency queue, blocker detection, task completion with artifacts, auto-prune), `manage_sessions` (agent attribution, turn tracking, context bootstrap).
- **Spec-Driven Development (SDD)**: `manage_specs` (PRD/RFC parsing, requirement-to-task decomposition, live acceptance criteria verification, compliance scoring).
- **Analytics, Audit & Diagnostics**: `get_analytics` (velocity, burndown, token ROI, cognitive load, critical path), `get_events` (SHA-256 tamper-evident event ledger), `run_diagnostics` (DAG validation, health checks, AST reference integrity).
- **Data, Snapshots & Multi-Agent**: `manage_snapshots` (checkpoints, time-travel undo), `manage_database` (backups, checksum audits, VCS branch merge), `manage_data` (bulk import/export, ML trajectories), `query_graph` (subgraphs, dependency tracing, raw SQL), `use_blackboard` (multi-agent asynchronous topic board).

👉 For complete parameter specifications, return schemas, and example payloads, see the **[Tools Reference Guide](docs/tools-reference.md)** and **[Formal API Reference](docs/api-reference.md)**.

---

## 🚀 Architecture & State Graph Lifecycle

```
                      AI Agent Prompt / Task
                                │
                                ▼
               ┌─────────────────────────────────┐
               │  Agent Session Attribution       │ ──▶ manage_sessions(action: "start")
               └────────────────┬────────────────┘
                                │
                                ▼
               ┌─────────────────────────────────┐
               │  Context & Task Prioritization   │ ──▶ get_analytics(action: "summary")
               │                                 │ ──▶ manage_tasks(action: "next")
               └────────────────┬────────────────┘
                                │
                                ▼
               ┌─────────────────────────────────┐
               │  Deterministic Graph Mutation   │ ──▶ manage_nodes(action: "create"|"update")
               │  (Tasks, Decisions, Blockers)   │ ──▶ manage_edges(action: "add"|"link_visual")
               └────────────────┬────────────────┘
                                │
                                ▼
               ┌─────────────────────────────────┐
               │  Spec & Integrity Verification  │ ──▶ manage_specs(action: "compliance"|"verify")
               │                                 │ ──▶ run_diagnostics(action: "validate")
               └────────────────┬────────────────┘
                                │
                                ▼
               ┌─────────────────────────────────┐
               │  Persistent SQLite Storage      │ ──▶ .state-memory-mcp/graph.db (WAL mode)
               │  Append-Only Event Ledger       │ ──▶ SHA-256 Cryptographic Audit Chain
               └─────────────────────────────────┘
```

## 📚 Documentation Directory

Explore dedicated guides and deep dives in the [`docs/`](docs/) directory:

| Guide | Description |
| :--- | :--- |
| 🏗️ **[Architecture & Codebase Distillation](docs/codebase-distillation.md)** | High-signal architectural overview, module inventory, data flows, and design decisions. |
| 🚀 **[v0.10 → v1.0 Migration Guide](MIGRATION.md)** | Step-by-step migration guide, legacy tool mapping table, and `STATE_MEMORY_COMPAT` mode. |
| 💡 **[Value Proposition & Theory](docs/value-proposition.md)** | Cognitive Externalization, FSM Formalism, First-Hop Determinism & Benchmark metrics. |
| 📋 **[State Memory Concepts](docs/concepts.md)** | Node Types (`task`, `decision`, `blocker`...), Status Values, Typed Edges & Seeding Guidelines. |
| ⚙️ **[Configuration & IDE Setup](docs/configuration.md)** | Auto-Initialization details, Environment Variables table, and Editor Configs (Cursor, VS Code, Claude, Antigravity, Windsurf). |
| 🛠️ **[CLI Command Reference](docs/cli-usage.md)** | CLI flags (`init`, `run`, `view`, `inspect`, `metrics`, `audit`, `doctor`, `backup`, `restore`, `merge`) & Git Scanner. |
| ⏱️ **[Sessions, Snapshots & SDD](docs/session-management.md)** | Session Lifecycle, Event Audit Trail, Snapshots, Trajectories, Sub-directory support & Spec-Driven Development. |
| 🧰 **[Tools, Resources & Prompts](docs/tools-reference.md)** | Complete reference for all 13 Consolidated MCP Tools, read-only `state-memory:///` Resources, and Prompt templates. |
| 📘 **[Formal API Reference](docs/api-reference.md)** | Formal parameters, return schemas, and code signatures for all MCP endpoints. |
| 🎨 **[3D Visualizer Guide](docs/visualizer.md)** | Viewing and exporting the interactive WebGL 3D Force-Directed Graph visualizer. |
| 🗄️ **[Database Schema](docs/database-schema.md)** | SQLite tables, columns, indexes, and schema migration history. |

---

## 📖 Agent Playbook: 5-Step Canonical Workflow

When an autonomous AI agent enters a repository with `state-memory-mcp`:

```
1. Orient & Bootstrap ──▶ manage_sessions(action: "start") + get_analytics(action: "summary")
2. Task Selection     ──▶ manage_tasks(action: "next") + manage_tasks(action: "find_blockers")
3. Trace Context      ──▶ query_graph(action: "trace") + manage_specs(action: "compliance")
4. Execute & Record   ──▶ manage_nodes(action: "create", type: "decision") + manage_edges(action: "link_visual")
5. Validate & Close   ──▶ run_diagnostics(action: "validate") + manage_tasks(action: "complete") + manage_sessions(action: "end")
```

---

## 🧪 Testing

```bash
# Run full unit, integration, and performance benchmark test suite across all 113 test files (418 tests)
npm run test
```

---

## ⚖️ License & Disclaimers

Developed and maintained by [PuterVision](https://putervision.com). Released under the [MIT License](LICENSE).

- **Local Storage Guarantee**: All graph data, decision records, and event logs remain 100% local in your workspace. No telemetry or project data is ever transmitted.
- **Trademarks & Non-Affiliation**: Product names (Cursor, Claude Code, Gemini, Windsurf, VS Code, GitHub, SQLite) are property of their respective owners and used solely for compatibility identification.