import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { getDb, getProjectSlug, getDbPath, getProjectDbDir, closeDb } from './db.js';
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
  const dbPath = getDbPath(params.project);

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found at: ${dbPath}`);
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
  if (nodes.length > 1000) {
    logger.warn(`Project has ${nodes.length} nodes. Visualizer performance or user experience might degrade.`);
  }

  const TYPE_COLORS: Record<NodeType, string> = {
    task: '#3b82f6',
    decision: '#a855f7',
    blocker: '#ef4444',
    artifact: '#22c55e',
    milestone: '#f59e0b',
    observation: '#06b6d4',
    plan: '#ec4899'
  };

  const EDGE_TYPE_COLORS: Record<string, string> = {
    depends_on: '#f59e0b80',
    blocks: '#ef444480',
    produces: '#22c55e80',
    references: '#64748b80',
    decided_in: '#a855f780',
    updates: '#3b82f680',
    contradicts: '#f4364c80',
    part_of: '#06b6d480',
    implements: '#10b98180',
    child_of: '#8b5cf680'
  };

  const connectionCounts = new Map<string, number>();
  for (const e of edges) {
    connectionCounts.set(e.source_id, (connectionCounts.get(e.source_id) || 0) + 1);
    connectionCounts.set(e.target_id, (connectionCounts.get(e.target_id) || 0) + 1);
  }

  const mappedNodes = nodes.map(n => ({
    id: n.id,
    name: n.title,
    type: n.type,
    status: n.status,
    val: (connectionCounts.get(n.id) || 0) + 1,
    color: TYPE_COLORS[n.type] || '#64748b',
    _node: n
  }));

  const mappedLinks = edges.map(e => ({
    source: e.source_id,
    target: e.target_id,
    type: e.type,
    color: EDGE_TYPE_COLORS[e.type] || '#64748b80',
    _edge: e
  }));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>state-graph-mcp - ${projectSlug}</title>
  <script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>
  <script src="https://unpkg.com/3d-force-graph@1.72.0"></script>
  <script src="https://unpkg.com/three-spritetext"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #0b0f19;
      --sidebar-bg: rgba(17, 24, 39, 0.85);
      --card-bg: rgba(31, 41, 55, 0.6);
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
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      position: relative;
    }
    h1, h2, h3, .brand {
      font-family: 'Outfit', sans-serif;
    }
    #graph-container {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 1;
    }
    #sidebar {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 380px;
      background: var(--sidebar-bg);
      backdrop-filter: blur(20px);
      border-left: 1px solid var(--border-color);
      padding: 24px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 20px;
      overflow-y: auto;
      z-index: 10;
    }
    .brand {
      font-size: 22px;
      font-weight: 700;
      background: linear-gradient(135deg, #38bdf8, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 4px;
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
      font-size: 15px;
      font-weight: 600;
      color: #e2e8f0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding-bottom: 8px;
    }
    .node-detail-title {
      font-size: 16px;
      font-weight: 600;
      color: #fff;
      word-break: break-word;
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
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      display: inline-block;
      width: fit-content;
    }
    .badge-task { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
    .badge-decision { background: rgba(168, 85, 247, 0.2); color: #c084fc; }
    .badge-blocker { background: rgba(239, 68, 68, 0.2); color: #f87171; }
    .badge-artifact { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
    .badge-milestone { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
    .badge-observation { background: rgba(6, 182, 212, 0.2); color: #22d3ee; }
    .badge-plan { background: rgba(236, 72, 153, 0.2); color: #f472b6; }

    .meta-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
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
      background: rgba(0,0,0,0.3);
      padding: 10px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 11px;
      overflow-x: auto;
      margin: 0;
      max-height: 200px;
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
      justify-content: space-between;
    }
    .filter-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .filter-item input[type="checkbox"] {
      cursor: pointer;
      accent-color: #38bdf8;
      width: 15px;
      height: 15px;
      margin: 0;
    }
    .layout-modes {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }
    .btn-toggle {
      background: #1e293b;
      border: 1px solid var(--border-color);
      color: #fff;
      padding: 6px 4px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: background 0.2s, border-color 0.2s;
      text-align: center;
    }
    .btn-toggle:hover {
      background: #334155;
    }
    .btn-toggle.active {
      background: rgba(56, 189, 248, 0.2);
      color: #38bdf8;
      border-color: #38bdf8;
    }
    .legend-colors {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      font-size: 11px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
  </style>
</head>
<body>
  <div id="graph-container"></div>
  <div id="sidebar">
    <div>
      <div class="brand">state-graph-mcp</div>
      <div style="font-size: 12px; color: var(--text-muted)">Project Workspace: <b>${projectSlug}</b></div>
    </div>
    
    <div class="card">
      <h3>3D Layout Mode</h3>
      <div class="layout-modes">
        <button id="layout-physics" class="btn-toggle active" onclick="setLayout('physics')">Physics</button>
        <button id="layout-dag-td" class="btn-toggle" onclick="setLayout('dag-td')">DAG-TD</button>
        <button id="layout-dag-lr" class="btn-toggle" onclick="setLayout('dag-lr')">DAG-LR</button>
      </div>
    </div>

    <div class="card">
      <h3>Entity Filters</h3>
      <div class="filter-group">
        <div class="filter-item">
          <div class="filter-left">
            <input type="checkbox" id="filter-task" checked onchange="updateFilters()">
            <span class="badge badge-task">Task</span>
          </div>
        </div>
        <div class="filter-item">
          <div class="filter-left">
            <input type="checkbox" id="filter-decision" checked onchange="updateFilters()">
            <span class="badge badge-decision">Decision</span>
          </div>
        </div>
        <div class="filter-item">
          <div class="filter-left">
            <input type="checkbox" id="filter-blocker" checked onchange="updateFilters()">
            <span class="badge badge-blocker">Blocker</span>
          </div>
        </div>
        <div class="filter-item">
          <div class="filter-left">
            <input type="checkbox" id="filter-artifact" checked onchange="updateFilters()">
            <span class="badge badge-artifact">Artifact</span>
          </div>
        </div>
        <div class="filter-item">
          <div class="filter-left">
            <input type="checkbox" id="filter-milestone" checked onchange="updateFilters()">
            <span class="badge badge-milestone">Milestone</span>
          </div>
        </div>
        <div class="filter-item">
          <div class="filter-left">
            <input type="checkbox" id="filter-observation" checked onchange="updateFilters()">
            <span class="badge badge-observation">Observation</span>
          </div>
        </div>
        <div class="filter-item">
          <div class="filter-left">
            <input type="checkbox" id="filter-plan" checked onchange="updateFilters()">
            <span class="badge badge-plan">Plan</span>
          </div>
        </div>
        <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 4px 0;">
        <div class="filter-item">
          <div class="filter-left">
            <input type="checkbox" id="filter-show-completed" checked onchange="updateFilters()">
            <span style="font-size: 13px;">Show Completed Tasks</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card" id="legend-card">
      <h3>Graph Legend</h3>
      <div class="legend-colors">
        <div class="legend-item"><div class="legend-dot" style="background:#3b82f6"></div><span>Task</span></div>
        <div class="legend-item"><div class="legend-dot" style="background:#a855f7"></div><span>Decision</span></div>
        <div class="legend-item"><div class="legend-dot" style="background:#ef4444"></div><span>Blocker</span></div>
        <div class="legend-item"><div class="legend-dot" style="background:#22c55e"></div><span>Artifact</span></div>
        <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div><span>Milestone</span></div>
        <div class="legend-item"><div class="legend-dot" style="background:#06b6d4"></div><span>Observation</span></div>
        <div class="legend-item"><div class="legend-dot" style="background:#ec4899"></div><span>Plan</span></div>
      </div>
    </div>

    <div id="detail-card" class="card" style="display: none;">
      <h3>Entity Details</h3>
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

    <div class="card" id="stats-card">
      <!-- Dynamically Populated -->
    </div>
  </div>

  <script>
    const TYPE_COLORS = ${JSON.stringify(TYPE_COLORS)};
    const allGraphNodes = ${JSON.stringify(mappedNodes)};
    const allGraphLinks = ${JSON.stringify(mappedLinks)};

    // Initialize graph
    const Graph = ForceGraph3D()(document.getElementById('graph-container'))
      .backgroundColor('#0b0f19')
      .nodeId('id')
      .nodeLabel(node => \`\${node.type}: \${node.name} (\${node.status})\`)
      .nodeColor(node => node.color)
      .nodeVal(node => node.val)
      .nodeOpacity(0.9)
      .nodeResolution(16)
      .linkSource('source')
      .linkTarget('target')
      .linkColor(link => link.color)
      .linkWidth(1.5)
      .linkLabel(link => link.type)
      .linkDirectionalArrowLength(4)
      .linkDirectionalArrowRelPos(1)
      .linkDirectionalParticles(link => ['blocks', 'contradicts'].includes(link.type) ? 3 : 1)
      .linkDirectionalParticleSpeed(0.005)
      .linkCurvature(0.15)
      .onNodeClick(handleNodeClick)
      .onNodeHover(handleNodeHover)
      .onBackgroundClick(handleBackgroundClick)
      .graphData({ nodes: allGraphNodes, links: allGraphLinks });

    // Custom SpriteText node labels (extend default node shapes)
    Graph.nodeThreeObject(node => {
      const sprite = new SpriteText(node.name);
      sprite.color = '#f8fafc';
      sprite.textHeight = 3.5;
      sprite.backgroundColor = node.color + '33'; // ~20% opacity background
      sprite.padding = 1.5;
      sprite.borderRadius = 2;
      sprite.position.y = 8; // Offset vertically to sit above the node sphere
      return sprite;
    })
    .nodeThreeObjectExtend(true);

    function handleNodeClick(node) {
      showDetails(node._node);
      
      // Smooth fly-to camera animation
      Graph.cameraPosition(
        { x: node.x + 80, y: node.y + 80, z: node.z + 80 }, // target camera position
        node, // lookAt target
        1000  // 1s animation duration
      );
    }

    function handleNodeHover(node) {
      document.body.style.cursor = node ? 'pointer' : 'default';
    }

    function handleBackgroundClick() {
      document.getElementById('detail-card').style.display = 'none';
    }

    function updateFilters() {
      const visibleTypes = [];
      ['task', 'decision', 'blocker', 'artifact', 'milestone', 'observation', 'plan'].forEach(t => {
        if (document.getElementById('filter-' + t).checked) {
          visibleTypes.push(t);
        }
      });

      const showCompleted = document.getElementById('filter-show-completed').checked;

      const filteredNodes = allGraphNodes.filter(n => {
        if (!visibleTypes.includes(n.type)) return false;
        if (!showCompleted && n.type === 'task' && ['done', 'cancelled'].includes(n.status)) {
          return false;
        }
        return true;
      });

      const visibleIds = new Set(filteredNodes.map(n => n.id));
      const filteredLinks = allGraphLinks.filter(l => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        return visibleIds.has(sourceId) && visibleIds.has(targetId);
      });

      Graph.graphData({ nodes: filteredNodes, links: filteredLinks });
    }

    function setLayout(mode) {
      document.getElementById('layout-physics').classList.remove('active');
      document.getElementById('layout-dag-td').classList.remove('active');
      document.getElementById('layout-dag-lr').classList.remove('active');
      document.getElementById('layout-' + mode).classList.add('active');

      if (mode === 'physics') {
        Graph.dagMode(null);
        Graph.d3Force('charge').strength(-120);
      } else if (mode === 'dag-td') {
        Graph.dagMode('td');
      } else if (mode === 'dag-lr') {
        Graph.dagMode('lr');
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

    function populateStats() {
      const counts = { task: 0, decision: 0, blocker: 0, artifact: 0, milestone: 0, observation: 0, plan: 0 };
      allGraphNodes.forEach(n => {
        if (counts[n.type] !== undefined) counts[n.type]++;
      });
      
      let html = '<h3>Entity Statistics</h3>';
      Object.keys(counts).forEach(type => {
        html += \`
          <div class="meta-item">
            <span class="badge badge-\${type}">\${type}</span>
            <span class="meta-value">\${counts[type]}</span>
          </div>
        \`;
      });
      document.getElementById('stats-card').innerHTML = html;
    }

    // Populate stats on start
    populateStats();
  </script>
</body>
</html>`;
}

/**
 * In-memory cycle detection for dependency-like edges (depends_on, blocks, child_of)
 */
function findCycles(nodes: BaseNode[], edges: Edge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    adj.set(n.id, []);
  }
  for (const e of edges) {
    if (e.type === 'depends_on' || e.type === 'child_of') {
      if (adj.has(e.source_id)) {
        adj.get(e.source_id)!.push(e.target_id);
      }
    } else if (e.type === 'blocks') {
      if (adj.has(e.target_id)) {
        adj.get(e.target_id)!.push(e.source_id);
      }
    }
  }

  const visited = new Map<string, 'white' | 'gray' | 'black'>();
  for (const n of nodes) {
    visited.set(n.id, 'white');
  }

  const cycles: string[][] = [];
  const parent = new Map<string, string>();

  function dfs(u: string) {
    visited.set(u, 'gray');
    const neighbors = adj.get(u) || [];
    for (const v of neighbors) {
      if (visited.get(v) === 'gray') {
        const cycle = [v];
        let curr = u;
        while (curr !== v && curr) {
          cycle.push(curr);
          curr = parent.get(curr)!;
        }
        cycle.push(v);
        cycles.push(cycle.reverse());
      } else if (visited.get(v) === 'white') {
        parent.set(v, u);
        dfs(v);
      }
    }
    visited.set(u, 'black');
  }

  for (const n of nodes) {
    if (visited.get(n.id) === 'white') {
      dfs(n.id);
    }
  }

  return cycles;
}

/**
 * Safely back up the SQLite database file for a project
 */
export async function backupProjectDb(params: {
  project?: string;
  outputPath?: string;
}): Promise<string> {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);
  
  let targetPath = params.outputPath;
  if (!targetPath) {
    const dbDir = getProjectDbDir(params.project);
    const backupsDir = path.join(dbDir, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+/, '')
      .replace('T', '-');
    targetPath = path.join(backupsDir, `backup-${timestamp}.db`);
  } else {
    targetPath = path.resolve(targetPath);
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  }

  logger.info(`Starting online database backup for project "${projectSlug}" to: ${targetPath}`);
  await db.backup(targetPath);
  logger.info(`Database backup completed successfully for project "${projectSlug}"`);
  return targetPath;
}

/**
 * Restore database from backup
 */
export function restoreProjectDb(params: {
  backupPath: string;
  project?: string;
}): void {
  const dbPath = getDbPath(params.project);
  const resolvedBackupPath = path.resolve(params.backupPath);

  if (!fs.existsSync(resolvedBackupPath)) {
    throw new Error(`Backup file not found: ${resolvedBackupPath}`);
  }

  // 1. Verify structural soundness of backup
  try {
    const tempDb = new Database(resolvedBackupPath, { readonly: true });
    const check = tempDb.pragma('integrity_check') as any[];
    tempDb.close();
    const isOk = Array.isArray(check) && check.length === 1 && (check[0] === 'ok' || check[0]?.integrity_check === 'ok');
    if (!isOk) {
      throw new Error(`Backup file integrity check failed: ${JSON.stringify(check)}`);
    }
  } catch (err: any) {
    throw new Error(`Invalid sqlite database file: ${err.message}`);
  }

  // 2. Close active connection
  closeDb(params.project);

  // 3. Clear WAL and shm files if they exist
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

  // 4. Overwrite DB file
  fs.copyFileSync(resolvedBackupPath, dbPath);

  // 5. Re-open/initialize database
  getDb(params.project);
  logger.info(`Database restored successfully from: ${resolvedBackupPath}`);
}

export interface AuditReport {
  project: string;
  sqlite_integrity: string[];
  foreign_key_violations: any[];
  orphaned_edges_count: number;
  orphaned_edges: { id: string; source_id: string; target_id: string; type: string }[];
  cycles: string[][];
  contradictions: {
    blocked_done_tasks: { task: BaseNode; blocker: BaseNode }[];
    contradicting_decisions: { decision1: BaseNode; decision2: BaseNode }[];
  };
  node_count: number;
  edge_count: number;
  warnings: string[];
}

/**
 * Audit project database for integrity and logical problems
 */
export function auditProjectDb(params: {
  project?: string;
}): AuditReport {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  const report: AuditReport = {
    project: projectSlug,
    sqlite_integrity: [],
    foreign_key_violations: [],
    orphaned_edges_count: 0,
    orphaned_edges: [],
    cycles: [],
    contradictions: {
      blocked_done_tasks: [],
      contradicting_decisions: []
    },
    node_count: 0,
    edge_count: 0,
    warnings: []
  };

  // 1. SQLite Integrity check
  const integrity = db.pragma('integrity_check') as any[];
  const integrityStrings = integrity.map(row => typeof row === 'string' ? row : row?.integrity_check);
  report.sqlite_integrity = integrityStrings;
  if (!integrityStrings.includes('ok')) {
    report.warnings.push('Physical database integrity check failed.');
  }

  // 2. SQLite Foreign Key check
  const fkViolations = db.pragma('foreign_key_check') as any[];
  report.foreign_key_violations = fkViolations;
  if (fkViolations.length > 0) {
    report.warnings.push(`Detected ${fkViolations.length} foreign key violations.`);
  }

  // Fetch nodes and edges
  const nodeRows = db.prepare('SELECT * FROM nodes WHERE project = ?').all(projectSlug) as any[];
  const edgeRows = db.prepare('SELECT * FROM edges WHERE project = ?').all(projectSlug) as any[];

  report.node_count = nodeRows.length;
  report.edge_count = edgeRows.length;

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
    updated_at: row.updated_at
  }));

  const edges: Edge[] = edgeRows.map(row => ({
    id: row.id,
    source_id: row.source_id,
    target_id: row.target_id,
    type: row.type as any,
    properties: JSON.parse(row.properties || '{}'),
    project: row.project,
    git_branch: row.git_branch,
    created_at: row.created_at
  }));

  const nodeIds = new Set(nodes.map(n => n.id));

  // 3. Orphaned Edges check (referential integrity)
  const orphaned = edges.filter(e => !nodeIds.has(e.source_id) || !nodeIds.has(e.target_id));
  report.orphaned_edges_count = orphaned.length;
  report.orphaned_edges = orphaned.map(e => ({
    id: e.id,
    source_id: e.source_id,
    target_id: e.target_id,
    type: e.type
  }));

  if (orphaned.length > 0) {
    report.warnings.push(`Detected ${orphaned.length} orphaned edges referencing missing nodes.`);
  }

  // 4. Cycle Detection
  const cycles = findCycles(nodes, edges);
  report.cycles = cycles;
  if (cycles.length > 0) {
    report.warnings.push(`Detected ${cycles.length} circular dependencies.`);
  }

  // 5. Logical Contradictions check
  const taskContradictions = db.prepare(`
    SELECT DISTINCT t.id as t_id, b.id as b_id
    FROM nodes t
    JOIN edges e ON e.target_id = t.id
    JOIN nodes b ON e.source_id = b.id
    WHERE t.project = ? AND t.type = 'task' AND t.status = 'done' 
      AND e.type = 'blocks' AND b.type = 'blocker' AND b.status = 'active'
  `).all(projectSlug) as any[];

  const depContradictions = db.prepare(`
    SELECT DISTINCT t.id as t_id, dep.id as b_id
    FROM nodes t
    JOIN edges e ON e.source_id = t.id
    JOIN nodes dep ON e.target_id = dep.id
    WHERE t.project = ? AND t.type = 'task' AND t.status = 'done'
      AND e.type = 'depends_on' AND dep.type = 'task' AND dep.status != 'done' AND dep.status != 'cancelled'
  `).all(projectSlug) as any[];

  const allBlockedDone = [...taskContradictions, ...depContradictions];
  const nodesMap = new Map<string, BaseNode>(nodes.map(n => [n.id, n]));

  for (const r of allBlockedDone) {
    const task = nodesMap.get(r.t_id);
    const blocker = nodesMap.get(r.b_id);
    if (task && blocker) {
      report.contradictions.blocked_done_tasks.push({ task, blocker });
    }
  }

  const decisionContradictions = db.prepare(`
    SELECT DISTINCT d1.id as id1, d2.id as id2
    FROM edges e
    JOIN nodes d1 ON e.source_id = d1.id
    JOIN nodes d2 ON e.target_id = d2.id
    WHERE e.project = ? AND e.type = 'contradicts'
      AND d1.type = 'decision' AND d1.status = 'accepted'
      AND d2.type = 'decision' AND d2.status = 'accepted'
  `).all(projectSlug) as any[];

  for (const r of decisionContradictions) {
    const decision1 = nodesMap.get(r.id1);
    const decision2 = nodesMap.get(r.id2);
    if (decision1 && decision2) {
      report.contradictions.contradicting_decisions.push({ decision1, decision2 });
    }
  }

  const totalContradictions = report.contradictions.blocked_done_tasks.length + report.contradictions.contradicting_decisions.length;
  if (totalContradictions > 0) {
    report.warnings.push(`Detected ${totalContradictions} logical contradictions.`);
  }

  return report;
}

export interface MergeReport {
  project: string;
  nodes_added: number;
  nodes_updated: number;
  nodes_skipped: number;
  edges_added: number;
  edges_skipped: number;
  cycles_detected: string[][];
  transaction_rolled_back: boolean;
  warnings: string[];
}

/**
 * Merge source database into target project database
 */
export function mergeProjectDb(params: {
  sourcePath: string;
  project?: string;
  force?: boolean;
}): MergeReport {
  const projectSlug = getProjectSlug(params.project);
  const resolvedSourcePath = path.resolve(params.sourcePath);

  if (!fs.existsSync(resolvedSourcePath)) {
    throw new Error(`Source database file not found: ${resolvedSourcePath}`);
  }

  // 1. Verify structural soundness of source DB
  let sourceDb: Database.Database;
  try {
    sourceDb = new Database(resolvedSourcePath, { readonly: true });
    const check = sourceDb.pragma('integrity_check') as any[];
    const isOk = Array.isArray(check) && check.length === 1 && (check[0] === 'ok' || check[0]?.integrity_check === 'ok');
    if (!isOk) {
      sourceDb.close();
      throw new Error(`Source database integrity check failed: ${JSON.stringify(check)}`);
    }
    
    // Check tables exist
    const tables = sourceDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('nodes', 'edges')").all();
    if (tables.length < 2) {
      sourceDb.close();
      throw new Error("Invalid source database: 'nodes' and 'edges' tables must exist.");
    }
  } catch (err: any) {
    throw new Error(`Invalid source sqlite database file: ${err.message}`);
  }

  // Read all source nodes and edges
  const sourceNodes = sourceDb.prepare('SELECT * FROM nodes').all() as any[];
  const sourceEdges = sourceDb.prepare('SELECT * FROM edges').all() as any[];
  sourceDb.close();

  const targetDb = getDb(params.project);

  const report: MergeReport = {
    project: projectSlug,
    nodes_added: 0,
    nodes_updated: 0,
    nodes_skipped: 0,
    edges_added: 0,
    edges_skipped: 0,
    cycles_detected: [],
    transaction_rolled_back: false,
    warnings: []
  };

  try {
    targetDb.transaction(() => {
      // 1. Process Nodes
      for (const node of sourceNodes) {
        const existing = targetDb.prepare('SELECT updated_at FROM nodes WHERE id = ?').get(node.id) as { updated_at: string } | undefined;
        if (!existing) {
          targetDb.prepare(`
            INSERT INTO nodes (id, type, title, status, project, git_branch, metadata, tags, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            node.id, node.type, node.title, node.status, projectSlug,
            node.git_branch, node.metadata, node.tags, node.created_at, node.updated_at
          );
          report.nodes_added++;
        } else {
          if (node.updated_at > existing.updated_at) {
            targetDb.prepare(`
              UPDATE nodes
              SET type = ?, title = ?, status = ?, project = ?, git_branch = ?, metadata = ?, tags = ?, created_at = ?, updated_at = ?
              WHERE id = ?
            `).run(
              node.type, node.title, node.status, projectSlug,
              node.git_branch, node.metadata, node.tags, node.created_at, node.updated_at, node.id
            );
            report.nodes_updated++;
          } else {
            report.nodes_skipped++;
          }
        }
      }

      // Fetch all node IDs currently in target DB (existing + newly inserted/updated)
      const allNodeIds = new Set(
        (targetDb.prepare('SELECT id FROM nodes WHERE project = ?').all(projectSlug) as { id: string }[]).map(row => row.id)
      );

      // 2. Process Edges
      for (const edge of sourceEdges) {
        // Skip edges pointing to non-existent nodes
        if (!allNodeIds.has(edge.source_id) || !allNodeIds.has(edge.target_id)) {
          report.warnings.push(`Skipped edge ${edge.id} (${edge.type}) because source (${edge.source_id}) or target (${edge.target_id}) node is missing.`);
          report.edges_skipped++;
          continue;
        }

        const existingEdge = targetDb.prepare(`
          SELECT 1 FROM edges WHERE source_id = ? AND target_id = ? AND type = ?
        `).get(edge.source_id, edge.target_id, edge.type);

        if (!existingEdge) {
          targetDb.prepare(`
            INSERT INTO edges (id, source_id, target_id, type, properties, project, git_branch, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            edge.id, edge.source_id, edge.target_id, edge.type, edge.properties,
            projectSlug, edge.git_branch, edge.created_at
          );
          report.edges_added++;
        } else {
          report.edges_skipped++;
        }
      }

      // 3. Cycle Validation
      const currentNodes = targetDb.prepare('SELECT * FROM nodes WHERE project = ?').all(projectSlug) as any[];
      const currentEdges = targetDb.prepare('SELECT * FROM edges WHERE project = ?').all(projectSlug) as any[];

      const parsedNodes: BaseNode[] = currentNodes.map(row => ({
        id: row.id,
        type: row.type as NodeType,
        title: row.title,
        status: row.status,
        project: row.project,
        git_branch: row.git_branch,
        metadata: JSON.parse(row.metadata || '{}'),
        tags: JSON.parse(row.tags || '[]'),
        created_at: row.created_at,
        updated_at: row.updated_at
      }));

      const parsedEdges: Edge[] = currentEdges.map(row => ({
        id: row.id,
        source_id: row.source_id,
        target_id: row.target_id,
        type: row.type as any,
        properties: JSON.parse(row.properties || '{}'),
        project: row.project,
        git_branch: row.git_branch,
        created_at: row.created_at
      }));

      const cycles = findCycles(parsedNodes, parsedEdges);
      if (cycles.length > 0) {
        report.cycles_detected = cycles;
        if (!params.force) {
          throw new Error('Merge introduces circular dependencies.');
        } else {
          report.warnings.push(`Merge succeeded but introduced ${cycles.length} circular dependencies.`);
        }
      }
    })();
  } catch (error: any) {
    if (error.message === 'Merge introduces circular dependencies.') {
      report.transaction_rolled_back = true;
    }
    throw error;
  }

  return report;
}

