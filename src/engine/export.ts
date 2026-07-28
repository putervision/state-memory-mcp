import { getDb, getProjectSlug, resolveProjectRoot } from './db.js';
import { BaseNode, Edge, NodeType, NodeRow, EdgeRow } from '../schema/types.js';
import { parseNodeRow, parseEdgeRow } from './row-mappers.js';
import { VERSION } from '../utils/version.js';
import { logger } from '../utils/logger.js';
import { validatePath, loadPathConfig } from '../utils/path-validator.js';
import { EventEngine } from './events.js';
import * as fs from 'fs';
import * as path from 'path';

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const TYPE_COLORS: Record<NodeType, string> = {
  task: '#3b82f6',
  decision: '#a855f7',
  blocker: '#ef4444',
  artifact: '#22c55e',
  milestone: '#f59e0b',
  observation: '#06b6d4',
  plan: '#ec4899',
  spec: '#8b5cf6',
  requirement: '#10b981',
  acceptance_criterion: '#f59e0b',
  contract: '#6366f1',
  visual_state: '#14b8a6',
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
  child_of: '#8b5cf680',
};

/**
 * Generate premium dark-themed 3D force-directed graph visualization HTML.
 */
export function generateVisualizerHtml(
  projectSlug: string,
  nodes: BaseNode[],
  edges: Edge[]
): string {
  const escapedSlug = escapeHtml(projectSlug);
  if (nodes.length > 1000) {
    logger.warn(
      `Project has ${nodes.length} nodes. Visualizer performance or user experience might degrade.`
    );
  }

  const connectionCounts = new Map<string, number>();
  for (const e of edges) {
    connectionCounts.set(e.source_id, (connectionCounts.get(e.source_id) || 0) + 1);
    connectionCounts.set(e.target_id, (connectionCounts.get(e.target_id) || 0) + 1);
  }

  const mappedNodes = nodes.map((n) => ({
    id: n.id,
    name: n.title,
    type: n.type,
    status: n.status,
    val: (connectionCounts.get(n.id) || 0) + 1,
    color: TYPE_COLORS[n.type] || '#64748b',
    _node: n,
  }));

  const mappedLinks = edges.map((e) => ({
    source: e.source_id,
    target: e.target_id,
    type: e.type,
    color: EDGE_TYPE_COLORS[e.type] || '#64748b80',
    _edge: e,
  }));

  const safeJsonStringify = (val: any) => {
    return JSON.stringify(val).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>state-memory-mcp - ${escapedSlug}</title>
  <script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>
  <script src="https://unpkg.com/3d-force-graph@1.72.0/dist/3d-force-graph.min.js"></script>
  <script src="https://unpkg.com/three-spritetext@1.8.2/dist/three-spritetext.min.js"></script>
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
      <div class="brand">state-memory-mcp</div>
      <div style="font-size: 12px; color: var(--text-muted)">Project Workspace: <b>${escapedSlug}</b></div>
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
    const TYPE_COLORS = ${safeJsonStringify(TYPE_COLORS)};
    const allGraphNodes = ${safeJsonStringify(mappedNodes)};
    const allGraphLinks = ${safeJsonStringify(mappedLinks)};

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

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function showDetails(details) {
      document.getElementById('detail-card').style.display = 'flex';
      
      const badge = document.getElementById('detail-badge');
      badge.className = 'badge badge-' + details.type;
      badge.textContent = details.type;
      
      document.getElementById('detail-title').textContent = details.title;
      
      const meta = document.getElementById('detail-meta');
      meta.innerHTML = \`
        <div class="meta-item"><span class="meta-label">ID</span><span class="meta-value" style="font-family:monospace; font-size:11px;">\${escapeHtml(details.id)}</span></div>
        <div class="meta-item"><span class="meta-label">Status</span><span class="meta-value">\${escapeHtml(details.status)}</span></div>
        <div class="meta-item"><span class="meta-label">Branch</span><span class="meta-value">\${escapeHtml(details.git_branch || 'main')}</span></div>
        <div class="meta-item"><span class="meta-label">Created</span><span class="meta-value">\${escapeHtml(new Date(details.created_at).toLocaleDateString())}</span></div>
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
 * Export project nodes and edges in DOT, Mermaid, JSON, or interactive HTML format.
 */
export function exportGraph(params: {
  project?: string;
  format: 'json' | 'dot' | 'mermaid' | 'html';
  outputPath?: string;
}): string {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  const nodeRows = db
    .prepare('SELECT * FROM nodes WHERE project = ? ORDER BY id ASC')
    .all(projectSlug) as NodeRow[];
  const edgeRows = db
    .prepare('SELECT * FROM edges WHERE project = ? ORDER BY id ASC')
    .all(projectSlug) as EdgeRow[];

  const nodes = nodeRows.map(parseNodeRow);
  const edges = edgeRows.map(parseEdgeRow);

  let result = '';
  if (params.format === 'json') {
    let auditProof: any = null;
    try {
      auditProof = EventEngine.verifyAuditChain(db, projectSlug);
    } catch {
      // Ignore verification errors if no events exist
    }

    result = JSON.stringify(
      {
        project: projectSlug,
        version: VERSION,
        exported_at: new Date().toISOString(),
        audit_verification: auditProof,
        nodes,
        edges,
      },
      null,
      2
    );
  } else if (params.format === 'dot') {
    let dot = 'digraph G {\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box, style="filled,rounded", fontname="Arial"];\n';

    const colors: Record<NodeType, string> = {
      task: '"#bae6fd"', // blue
      decision: '"#bbf7d0"', // green
      blocker: '"#fecaca"', // red
      artifact: '"#e9d5ff"', // purple
      milestone: '"#fef08a"', // gold
      observation: '"#e2e8f0"', // gray
      plan: '"#fed7aa"', // orange
      spec: '"#ddd6fe"', // violet
      requirement: '"#a7f3d0"', // emerald
      acceptance_criterion: '"#fde68a"', // amber
      contract: '"#c7d2fe"', // indigo
      visual_state: '"#99f6e4"', // teal
    };

    const escapeDot = (val: string) => val.replace(/"/g, '\\"');

    for (const n of nodes) {
      const color = colors[n.type] || '"#ffffff"';
      dot += `  "${n.id}" [label="${escapeDot(n.title)}\\n(${n.type}: ${n.status})", fillcolor=${color}];\n`;
    }

    for (const e of edges) {
      dot += `  "${e.source_id}" -> "${e.target_id}" [label="${e.type}"];\n`;
    }

    dot += '}\n';
    result = dot;
  } else if (params.format === 'mermaid') {
    let mermaid = 'flowchart TD\n';
    mermaid += '  classDef task fill:#bae6fd,stroke:#0284c7;\n';
    mermaid += '  classDef decision fill:#bbf7d0,stroke:#16a34a;\n';
    mermaid += '  classDef blocker fill:#fecaca,stroke:#dc2626;\n';
    mermaid += '  classDef artifact fill:#e9d5ff,stroke:#9333ea;\n';
    mermaid += '  classDef milestone fill:#fef08a,stroke:#ca8a04;\n';
    mermaid += '  classDef observation fill:#e2e8f0,stroke:#475569;\n';
    mermaid += '  classDef plan fill:#fed7aa,stroke:#ea580c;\n';

    const escapeMermaid = (val: string) =>
      val
        .replace(/"/g, '&quot;')
        .replace(/\[/g, '&#91;')
        .replace(/\]/g, '&#93;')
        .replace(/\(/g, '&#40;')
        .replace(/\)/g, '&#41;');

    for (const n of nodes) {
      mermaid += `  ${n.id}["${escapeMermaid(n.title)} (${n.type})"]\n`;
      mermaid += `  class ${n.id} ${n.type};\n`;
    }

    for (const e of edges) {
      mermaid += `  ${e.source_id} -->|${e.type}| ${e.target_id}\n`;
    }

    result = mermaid;
  } else if (params.format === 'html') {
    result = generateVisualizerHtml(projectSlug, nodes, edges);
  } else {
    throw new Error(`Unsupported format: ${params.format}`);
  }

  if (params.outputPath) {
    const projectRoot = resolveProjectRoot(params.project);
    const pathConfig = loadPathConfig(projectRoot);
    const validatedPath = validatePath(params.outputPath, pathConfig);

    const parentDir = path.dirname(validatedPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(validatedPath, result, 'utf-8');
    return `Exported project ${projectSlug} to ${validatedPath} in ${params.format} format`;
  }

  return result;
}
