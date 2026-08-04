# @putervision/state-memory-mcp

[![npm version](https://img.shields.io/npm/v/@putervision/state-memory-mcp.svg)](https://www.npmjs.com/package/@putervision/state-memory-mcp)
[![Website](https://img.shields.io/badge/Website-statememorymcp.com-6366f1.svg)](https://statememorymcp.com)
[![License](https://img.shields.io/npm/l/@putervision/state-memory-mcp.svg)](https://github.com/putervision/state-memory-mcp/blob/main/LICENSE)

`@putervision/state-memory-mcp` is a zero-infrastructure, deterministic Model Context Protocol (MCP) server that provides AI coding assistants (such as Cursor, Claude Code, Gemini, or Copilot) with a structured, persistent SQLite graph for tracking workflow state—tasks, decisions, artifacts, plans, blockers, and their semantic relationships.

🌐 **Official Documentation & Website**: [statememorymcp.com](https://statememorymcp.com)

---

## ⚡ Quick Start & Installation

> **Prerequisites**: Node.js **>= 20.0.0**

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
- **⚡ 82 Core MCP Tools**: Full CRUD, relationship linking, DAG cycle checks, FTS5 search, TF-IDF RAG, time-travel history rollback, Spec-Driven Development, and auto-healing validation.
- **📉 Up to 462× Token Savings**: Offloads context to a local SQLite database, avoiding context bloat and linear prompt degradation.
- **🚀 67%–74% Latency Reduction**: Eliminates multi-step file scanning loops; agents retrieve unblocked tasks and blockers in milliseconds.
- **🤝 Multi-Agent Blackboard**: Shared Context Store allowing parallel subagents to publish decisions, tasks, and blocker updates safely.
- **🎨 Interactive 3D Visualizer**: Browser-based dark-mode 3D WebGL force-directed graph visualizer (`state-memory-mcp view`).
- **🛡️ 100% Local & Private**: Local-first architecture; all state stays inside `.state-memory-mcp/` in your workspace.

---

## 📚 Documentation Directory

Explore dedicated guides and deep dives in the [`docs/`](docs/) directory:

| Guide | Description |
| :--- | :--- |
| 💡 **[Value Proposition & Theory](docs/value-proposition.md)** | Cognitive Externalization, FSM Formalism, First-Hop Determinism & Benchmark metrics. |
| 📋 **[State Memory Concepts](docs/concepts.md)** | Node Types (`task`, `decision`, `blocker`...), Status Values, Typed Edges & Seeding Guidelines. |
| ⚙️ **[Configuration & IDE Setup](docs/configuration.md)** | Auto-Initialization details, Environment Variables table, and Editor Configs (Cursor, VS Code, Claude, Antigravity, Windsurf). |
| 🛠️ **[CLI Command Reference](docs/cli-usage.md)** | CLI flags (`init`, `run`, `view`, `inspect`, `metrics`, `audit`, `doctor`, `backup`, `restore`, `merge`) & Git Scanner. |
| ⏱️ **[Sessions, Snapshots & SDD](docs/session-management.md)** | Session Lifecycle, Event Audit Trail, Snapshots, Trajectories, Sub-directory support & Spec-Driven Development. |
| 🧰 **[Tools, Resources & Prompts](docs/tools-reference.md)** | Complete reference for all 82 MCP Tools, read-only `state-memory:///` Resources, and Prompt templates. |
| 📘 **[Formal API Reference](docs/api-reference.md)** | Formal parameters, return schemas, and code signatures for all MCP endpoints. |
| 🎨 **[3D Visualizer Guide](docs/visualizer.md)** | Viewing and exporting the interactive WebGL 3D Force-Directed Graph visualizer. |
| 🗄️ **[Database Schema](docs/database-schema.md)** | SQLite tables, columns, indexes, and schema migration history. |

---

## 🧪 Testing

```bash
# Run full unit, integration, and performance benchmark test suite
npm run test
```

---

## ⚖️ License & Disclaimers

Developed and maintained by [PuterVision LLC](https://putervision.com). Released under the [MIT License](LICENSE).

- **Local Storage Guarantee**: All graph data, decision records, and event logs remain 100% local in your workspace. No telemetry or project data is ever transmitted.
- **Trademarks & Non-Affiliation**: Product names (Cursor, Claude Code, Gemini, Windsurf, VS Code, GitHub, SQLite) are property of their respective owners and used solely for compatibility identification.