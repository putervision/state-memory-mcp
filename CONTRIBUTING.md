# Contributing to State-Memory-MCP

Thank you for considering contributing to `state-memory-mcp`! We welcome bug fixes, documentation improvements, feature proposals, and unit tests.

---

## Development Setup

### 1. Prerequisites
- Node.js **>= 18.18.0**
- npm **>= 9.0.0**
- git

### 2. Fork & Clone
```bash
git clone https://github.com/your-username/state-memory-mcp.git
cd state-memory-mcp
npm install
```

---

## Development Commands

```bash
# Start watch build mode
npm run dev

# Run unit tests
npm run test

# Run typechecking
npm run typecheck

# Check code formatting (Prettier)
npm run format:check

# Auto-format code
npm run format

# Run full CI suite (formatting + lint + typecheck + tests)
npm run ci

# Build production ESM bundle
npm run build
```

---

## Code Quality Standards

1. **TypeScript Strict Mode**: All code must compile cleanly under `tsc --noEmit` without explicit type suppression where avoidable.
2. **Deterministic Graph Mutations**: Every database mutation must log an append-only event (`EventEngine.logEvent`) and enforce cycle checks where directional edges are added.
3. **Security & Sanitization**: SQL parameters must be bound via `?` placeholders. File path access must be validated via `validatePath()` to prevent directory traversal.
4. **Unit Tests Required**: New features or bug fixes must include unit tests under `tests/engine/` or `tests/integration/`.

---

## Submitting a Pull Request (PR)

1. Create a feature branch: `git checkout -b feat/my-new-feature`.
2. Ensure all tests pass: `npm run ci`.
3. Commit your changes with descriptive messages: `git commit -m "feat: add support for custom edge properties"`.
4. Push to your fork and submit a Pull Request to `main`.

---

## Disclaimer & Limitation of Liability

This software is provided "as is", without warranty of any kind, express or implied. Under no circumstances shall the authors or contributors be liable for any database corruption, Git repository modification, data loss, or other issues resulting from execution. Always backup your database files before performing destructive operations.
