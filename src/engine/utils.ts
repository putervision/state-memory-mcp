import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { getDb, getProjectSlug, resolveProjectRoot, getBaseDir } from './db.js';
import { BaseNode, Edge, NodeType } from '../schema/types.js';
import { logger } from '../utils/logger.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';

/**
 * Run safe raw SELECT SQL queries against the database using a read-only connection
 */
export function queryGraph(params: {
  project?: string;
  sql: string;
  params?: any[];
}): any[] {
  const projectSlug = getProjectSlug(params.project);
  const root = resolveProjectRoot();
  const baseDir = getBaseDir(root);
  const dbPath = path.join(baseDir, projectSlug, 'graph.db');

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found for project: ${projectSlug}`);
  }

  // Open with readonly: true to enforce read-only access
  const readOnlyDb = new Database(dbPath, { readonly: true });
  
  try {
    readOnlyDb.pragma('busy_timeout = 5000');
    const stmt = readOnlyDb.prepare(params.sql);
    
    if (!stmt.reader) {
      throw new Error('Write operations (INSERT, UPDATE, DELETE, DROP, etc.) are strictly prohibited.');
    }

    const rows = stmt.all(...(params.params || []));
    // Hard cap at 500 rows to optimize context tokens
    return rows.slice(0, 500);
  } finally {
    readOnlyDb.close();
  }
}

/**
 * Export project nodes and edges in various formats (JSON, DOT, Mermaid, HTML visualizer)
 */
export function exportGraph(params: {
  project?: string;
  format: 'json' | 'dot' | 'mermaid' | 'html';
}): string {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  const nodeRows = db.prepare('SELECT * FROM nodes WHERE project = ?').all(projectSlug) as any[];
  const edgeRows = db.prepare('SELECT * FROM edges WHERE project = ?').all(projectSlug) as any[];

  const nodes: BaseNode[] = nodeRows.map(row => ({
    id: row.id,
    type: row.type as NodeType,
    title: row.title,
    status: row.status,
    project: row.project,
    git_branch: row.git_branch,
    metadata: JSON.parse(row.metadata || '{}'),
    tags: JSON.parse(row.tags || '[]'),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const edges: Edge[] = edgeRows.map(row => ({
    id: row.id,
    source_id: row.source_id,
    target_id: row.target_id,
    type: row.type as any,
    properties: JSON.parse(row.properties || '{}'),
    project: row.project,
    git_branch: row.git_branch,
    created_at: row.created_at,
  }));

  if (params.format === 'json') {
    return JSON.stringify({ nodes, edges }, null, 2);
  }

  if (params.format === 'dot') {
    let dot = 'digraph G {\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box, style="filled,rounded", fontname="Arial"];\n';
    
    // Node colors per type
    const colors: Record<NodeType, string> = {
      task: '"#bae6fd"', // blue
      decision: '"#bbf7d0"', // green
      blocker: '"#fecaca"', // red
      artifact: '"#e9d5ff"', // purple
      milestone: '"#fef08a"', // gold
      observation: '"#e2e8f0"', // gray
      plan: '"#fed7aa"' // orange
    };

    for (const n of nodes) {
      const color = colors[n.type] || '"#ffffff"';
      dot += `  "${n.id}" [label="${n.title}\\n(${n.type}: ${n.status})", fillcolor=${color}];\n`;
    }

    for (const e of edges) {
      dot += `  "${e.source_id}" -> "${e.target_id}" [label="${e.type}"];\n`;
    }

    dot += '}\n';
    return dot;
  }

  if (params.format === 'mermaid') {
    let mermaid = 'flowchart TD\n';
    // Style classes
    mermaid += '  classDef task fill:#bae6fd,stroke:#0284c7;\n';
    mermaid += '  classDef decision fill:#bbf7d0,stroke:#16a34a;\n';
    mermaid += '  classDef blocker fill:#fecaca,stroke:#dc2626;\n';
    mermaid += '  classDef artifact fill:#e9d5ff,stroke:#9333ea;\n';
    mermaid += '  classDef milestone fill:#fef08a,stroke:#ca8a04;\n';
    mermaid += '  classDef observation fill:#e2e8f0,stroke:#475569;\n';
    mermaid += '  classDef plan fill:#fed7aa,stroke:#ea580c;\n';

    for (const n of nodes) {
      mermaid += `  ${n.id}["${n.title} (${n.type})"]\n`;
      mermaid += `  class ${n.id} ${n.type};\n`;
    }

    for (const e of edges) {
      mermaid += `  ${e.source_id} -->|${e.type}| ${e.target_id}\n`;
    }

    return mermaid;
  }

  if (params.format === 'html') {
    // Generate beautiful vis-network visualization page
    return generateVisualizerHtml(projectSlug, nodes, edges);
  }

  throw new Error(`Unsupported format: ${params.format}`);
}

/**
 * Bulk import nodes and edges.
 * Wraps imports in a database transaction.
 */
export function importGraph(params: {
  project?: string;
  nodes: any[];
  edges: any[];
}): { imported_nodes_count: number; imported_edges_count: number } {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  db.transaction(() => {
    // 1. Clear existing nodes and edges for this project
    db.prepare('DELETE FROM edges WHERE project = ?').run(projectSlug);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(projectSlug);

    // 2. Insert nodes
    const nodeStmt = db.prepare(`
      INSERT INTO nodes (id, type, title, status, project, git_branch, metadata, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const n of params.nodes) {
      const id = n.id || generateId();
      const now = getCurrentIsoString();
      const metadata = typeof n.metadata === 'string' ? n.metadata : JSON.stringify(n.metadata || {});
      const tags = typeof n.tags === 'string' ? n.tags : JSON.stringify(n.tags || []);
      const branch = n.git_branch || 'main';

      nodeStmt.run(
        id,
        n.type || 'task',
        n.title || 'Untitled Node',
        n.status || 'pending',
        projectSlug,
        branch,
        metadata,
        tags,
        n.created_at || now,
        n.updated_at || now
      );
    }

    // 3. Insert edges
    const edgeStmt = db.prepare(`
      INSERT INTO edges (id, source_id, target_id, type, properties, project, git_branch, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const e of params.edges) {
      const id = e.id || generateId();
      const now = getCurrentIsoString();
      const properties = typeof e.properties === 'string' ? e.properties : JSON.stringify(e.properties || {});
      const branch = e.git_branch || 'main';

      edgeStmt.run(
        id,
        e.source_id,
        e.target_id,
        e.type,
        properties,
        projectSlug,
        branch,
        e.created_at || now
      );
    }
  })();

  logger.info(`Imported ${params.nodes.length} nodes and ${params.edges.length} edges for project ${projectSlug}`);

  return {
    imported_nodes_count: params.nodes.length,
    imported_edges_count: params.edges.length,
  };
}

/**
 * Generate premium dark-themed vis-network visualization HTML
 */
function generateVisualizerHtml(projectSlug: string, nodes: BaseNode[], edges: Edge[]): string {
  const visNodes = nodes.map(n => {
    // Styles mapping
    const styles: Record<NodeType, { color: string; border: string; highlight: string }> = {
      task: { color: '#0284c7', border: '#bae6fd', highlight: '#38bdf8' },
      decision: { color: '#16a34a', border: '#bbf7d0', highlight: '#4ade80' },
      blocker: { color: '#dc2626', border: '#fecaca', highlight: '#f87171' },
      artifact: { color: '#9333ea', border: '#e9d5ff', highlight: '#c084fc' },
      milestone: { color: '#ca8a04', border: '#fef08a', highlight: '#facc15' },
      observation: { color: '#475569', border: '#e2e8f0', highlight: '#94a3b8' },
      plan: { color: '#ea580c', border: '#fed7aa', highlight: '#fb923c' }
    };

    const style = styles[n.type] || { color: '#475569', border: '#e2e8f0', highlight: '#94a3b8' };

    return {
      id: n.id,
      label: n.title,
      title: `${n.title} (${n.type})`,
      group: n.type,
      color: {
        background: style.color,
        border: style.border,
        highlight: {
          background: style.color,
          border: style.highlight
        }
      },
      font: { color: '#f8fafc' },
      borderWidth: 2,
      shape: 'box',
      margin: 12,
      // Store all fields for click details cards
      _details: n
    };
  });

  const visEdges = edges.map(e => ({
    id: e.id,
    from: e.source_id,
    to: e.target_id,
    label: e.type,
    arrows: 'to',
    color: {
      color: '#64748b',
      highlight: '#94a3b8',
      hover: '#cbd5e1'
    },
    font: {
      color: '#94a3b8',
      size: 11,
      align: 'middle'
    },
    width: 2,
    _details: e
  }));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>state-graph-mcp - ${projectSlug}</title>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #0b0f19;
      --sidebar-bg: rgba(17, 24, 39, 0.8);
      --card-bg: rgba(31, 41, 55, 0.5);
      --border-color: rgba(255, 255, 255, 0.08);
      --text-color: #f3f4f6;
      --text-muted: #9ca3af;
    }
    body {
      margin: 0;
      padding: 0;
      background: var(--bg-color);
      color: var(--text-color);
      font-family: 'Inter', sans-serif;
      display: flex;
      height: 100vh;
      overflow: hidden;
    }
    h1, h2, h3, .brand {
      font-family: 'Outfit', sans-serif;
    }
    #network {
      flex: 1;
      height: 100%;
    }
    #sidebar {
      width: 360px;
      background: var(--sidebar-bg);
      backdrop-filter: blur(20px);
      border-left: 1px solid var(--border-color);
      padding: 24px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 24px;
      overflow-y: auto;
      z-index: 10;
    }
    .brand {
      font-size: 22px;
      font-weight: 700;
      background: linear-gradient(135deg, #38bdf8, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .card h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }
    .node-detail-title {
      font-size: 18px;
      font-weight: 600;
      color: #fff;
    }
    .tag {
      background: rgba(255, 255, 255, 0.08);
      border-radius: 9999px;
      padding: 3px 10px;
      font-size: 11px;
      color: var(--text-muted);
      display: inline-block;
      margin-right: 4px;
      margin-top: 4px;
    }
    .badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      display: inline-block;
      width: fit-content;
    }
    .badge-task { background: rgba(2, 132, 199, 0.2); color: #38bdf8; }
    .badge-decision { background: rgba(22, 163, 74, 0.2); color: #4ade80; }
    .badge-blocker { background: rgba(220, 38, 38, 0.2); color: #f87171; }
    .badge-artifact { background: rgba(147, 51, 234, 0.2); color: #c084fc; }
    .badge-milestone { background: rgba(202, 138, 4, 0.2); color: #facc15; }
    .badge-observation { background: rgba(71, 85, 105, 0.2); color: #94a3b8; }
    .badge-plan { background: rgba(234, 88, 12, 0.2); color: #fb923c; }

    .meta-item {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      padding-bottom: 6px;
    }
    .meta-label {
      color: var(--text-muted);
    }
    .meta-value {
      color: #fff;
      font-weight: 500;
    }
    pre {
      background: rgba(0,0,0,0.2);
      padding: 10px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      overflow-x: auto;
      margin: 0;
    }
    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 13px;
    }
    .filter-item {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .filter-item input[type="checkbox"] {
      cursor: pointer;
      accent-color: #38bdf8;
      width: 15px;
      height: 15px;
    }
    .btn-toggle {
      background: #1e293b;
      border: 1px solid var(--border-color);
      color: #fff;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      flex: 1;
      transition: background 0.2s, border-color 0.2s;
    }
    .btn-toggle:hover {
      background: #334155;
    }
    .btn-toggle.active {
      background: rgba(56, 189, 248, 0.2);
      color: #38bdf8;
      border-color: #38bdf8;
    }
  </style>
</head>
<body>
  <div id="network"></div>
  <div id="sidebar">
    <div>
      <div class="brand">state-graph-mcp</div>
      <div style="font-size: 12px; color: var(--text-muted)">Project Workspace: <b>${projectSlug}</b></div>
    </div>
    
    <div class="card">
      <h3>Layout Style</h3>
      <div style="display: flex; gap: 8px;">
        <button id="layout-physics" class="btn-toggle active" onclick="setLayout('physics')">Physics</button>
        <button id="layout-hierarchical" class="btn-toggle" onclick="setLayout('hierarchical')">Hierarchy</button>
      </div>
    </div>

    <div class="card">
      <h3>Entity Filters</h3>
      <div class="filter-group">
        <div class="filter-item">
          <input type="checkbox" id="filter-task" checked onchange="updateFilters()">
          <span class="badge badge-task">Task</span>
        </div>
        <div class="filter-item">
          <input type="checkbox" id="filter-decision" checked onchange="updateFilters()">
          <span class="badge badge-decision">Decision</span>
        </div>
        <div class="filter-item">
          <input type="checkbox" id="filter-blocker" checked onchange="updateFilters()">
          <span class="badge badge-blocker">Blocker</span>
        </div>
        <div class="filter-item">
          <input type="checkbox" id="filter-artifact" checked onchange="updateFilters()">
          <span class="badge badge-artifact">Artifact</span>
        </div>
        <div class="filter-item">
          <input type="checkbox" id="filter-milestone" checked onchange="updateFilters()">
          <span class="badge badge-milestone">Milestone</span>
        </div>
        <div class="filter-item">
          <input type="checkbox" id="filter-observation" checked onchange="updateFilters()">
          <span class="badge badge-observation">Observation</span>
        </div>
        <div class="filter-item">
          <input type="checkbox" id="filter-plan" checked onchange="updateFilters()">
          <span class="badge badge-plan">Plan</span>
        </div>
        <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 6px 0;">
        <div class="filter-item">
          <input type="checkbox" id="filter-show-completed" checked onchange="updateFilters()">
          <span>Show Completed Tasks</span>
        </div>
      </div>
    </div>

    <div id="detail-card" class="card" style="display: none;">
      <h3 id="detail-card-header">Entity Details</h3>
      <div id="detail-badge"></div>
      <div id="detail-title" class="node-detail-title"></div>
      <div id="detail-meta" style="display: flex; flex-direction: column; gap: 8px;"></div>
      <div>
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">Tags</div>
        <div id="detail-tags"></div>
      </div>
      <div>
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">Metadata</div>
        <pre id="detail-metadata"></pre>
      </div>
    </div>
  </div>

  <script type="text/javascript">
    const nodes = new vis.DataSet(${JSON.stringify(visNodes)});
    const edges = new vis.DataSet(${JSON.stringify(visEdges)});

    // Dynamic views for checkbox filtering
    const nodesView = new vis.DataView(nodes, {
      filter: function (node) {
        const typeEl = document.getElementById('filter-' + node.group);
        const typeChecked = typeEl ? typeEl.checked : true;
        if (!typeChecked) return false;

        const showCompletedEl = document.getElementById('filter-show-completed');
        const showCompleted = showCompletedEl ? showCompletedEl.checked : true;
        if (!showCompleted && node._details.type === 'task' && (node._details.status === 'done' || node._details.status === 'cancelled')) {
          return false;
        }
        return true;
      }
    });

    const edgesView = new vis.DataView(edges, {
      filter: function (edge) {
        return nodesView.get(edge.from) && nodesView.get(edge.to);
      }
    });

    const container = document.getElementById('network');
    const data = { nodes: nodesView, edges: edgesView };
    const options = {
      nodes: {
        font: { face: 'Inter' }
      },
      edges: {
        font: { face: 'Inter' }
      },
      physics: {
        stabilization: true,
        barnesHut: {
          gravitationalConstant: -3000,
          springLength: 95,
          springConstant: 0.04
        }
      },
      interaction: {
        hover: true,
        tooltipDelay: 200
      }
    };

    const network = new vis.Network(container, data, options);

    network.on("click", function (params) {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = nodes.get(nodeId);
        showDetails(node._details);
      } else {
        document.getElementById('detail-card').style.display = 'none';
      }
    });

    function updateFilters() {
      nodesView.refresh();
      edgesView.refresh();
    }

    function setLayout(mode) {
      document.getElementById('layout-physics').classList.remove('active');
      document.getElementById('layout-hierarchical').classList.remove('active');
      document.getElementById('layout-' + mode).classList.add('active');

      if (mode === 'hierarchical') {
        network.setOptions({
          layout: {
            hierarchical: {
              enabled: true,
              direction: 'UD',
              sortMethod: 'directed',
              nodeSpacing: 180,
              levelSeparation: 150
            }
          },
          physics: {
            enabled: false
          }
        });
      } else {
        network.setOptions({
          layout: {
            hierarchical: {
              enabled: false
            }
          },
          physics: {
            enabled: true,
            barnesHut: {
              gravitationalConstant: -3000,
              springLength: 95,
              springConstant: 0.04
            }
          }
        });
      }
    }

    function showDetails(details) {
      document.getElementById('detail-card').style.display = 'flex';
      
      const badge = document.getElementById('detail-badge');
      badge.className = 'badge badge-' + details.type;
      badge.textContent = details.type;
      
      document.getElementById('detail-title').textContent = details.title;
      
      const meta = document.getElementById('detail-meta');
      meta.innerHTML = \`
        <div class="meta-item"><span class="meta-label">ID</span><span class="meta-value" style="font-family:monospace; font-size:11px;">\${details.id}</span></div>
        <div class="meta-item"><span class="meta-label">Status</span><span class="meta-value">\${details.status}</span></div>
        <div class="meta-item"><span class="meta-label">Branch</span><span class="meta-value">\${details.git_branch || 'main'}</span></div>
        <div class="meta-item"><span class="meta-label">Created</span><span class="meta-value">\${new Date(details.created_at).toLocaleDateString()}</span></div>
      \`;

      const tagsContainer = document.getElementById('detail-tags');
      tagsContainer.innerHTML = '';
      if (details.tags && details.tags.length > 0) {
        details.tags.forEach(t => {
          const span = document.createElement('span');
          span.className = 'tag';
          span.textContent = t;
          tagsContainer.appendChild(span);
        });
      } else {
        tagsContainer.innerHTML = '<span style="font-size:12px; color:var(--text-muted)">None</span>';
      }

      document.getElementById('detail-metadata').textContent = JSON.stringify(details.metadata, null, 2);
    }
  </script>
</body>
</html>`;
}
