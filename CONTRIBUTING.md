# Contributing to `state-graph-mcp`

Thank you for your interest in contributing to `state-graph-mcp`! This document outlines the guidelines and workflow for developing features, fixing bugs, and improving documentation.

---

## Getting Started

### Prerequisites
- **Node.js**: Version 18.0.0 or higher
- **npm**: Installed with Node.js
- **Git**: For version control

### Setup Instructions
1. Fork and clone the repository:
   ```bash
   git clone https://github.com/YourUsername/state-graph-mcp.git
   cd state-graph-mcp
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

---

## Development Workflow

### Building the Project
`state-graph-mcp` uses TypeScript and builds with `tsup`.
To compile the TypeScript source files to the `dist/` directory:
```bash
npm run build
```
During active development, you can use the watch script to rebuild on changes:
```bash
npm run dev
```

### Testing
We use `vitest` for running unit and integration tests.
To run the full test suite once:
```bash
npm run test
```
To run tests in watch mode during development:
```bash
npm run test:watch
```

### Code Style & Formatting
- **Linting**: We use ESLint. Enforce lint checks before pushing code:
  ```bash
  npm run lint
  ```
- **Formatting**: We use Prettier. Format your files using:
  ```bash
  npm run format
  ```

---

## Submission Guidelines

1. **Create a Branch**: Create a descriptive feature branch from the `main` branch.
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Commit Conventions**: We follow conventional commit styles (e.g. `feat: add new CLI command`, `fix: handle empty backups`).
3. **Write Tests**: Ensure any new features or bug fixes are covered by appropriate Vitest unit/integration tests in the `tests/` directory.
4. **Build & Verify**: Confirm that the code builds and linting and formatting checks pass:
   ```bash
   npm run build
   ```
5. **Open a Pull Request**: Submit your pull request to the `main` branch of the upstream repository. Make sure to describe the change, verify tests pass, and reference any corresponding issues.
