# Interactive 3D HTML Visualizer Guide

`state-memory-mcp` offers an interactive, dark-mode browser 3D visualization using WebGL/Three.js (`3d-force-graph`) to explore your project's workflow state graph.

![Interactive 3D Graph Visualizer](viewer-screenshot.png)

---

## 🚀 Viewing the Visualizer

To generate and view the visualizer instantly in your default web browser, run:

```bash
state-memory-mcp view --project my-project
```

This command:
1. Generates a standalone `viewer.html` containing the embedded graph dataset.
2. Saves it in the project database folder (`.state-memory-mcp/<project>/viewer.html`).
3. Automatically launches the page in your default browser.

---

## 📤 Exporting the Visualizer

To export the visualizer to a specific file:

```bash
state-memory-mcp export --project my-project --format html --out ./my-graph.html
```

You can share the exported HTML file with your team or publish it. The file contains a responsive 3D Force-Directed network graph rendering with:
- Interactive zoom, pan, and 360-degree rotation.
- Hover details for nodes and relationships.
- Distinct color-coded nodes based on types (`task`, `decision`, `artifact`, `plan`, `milestone`, `blocker`, `observation`).
- Automatic force-directed physics layout.
