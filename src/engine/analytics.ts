import { getDb, getProjectSlug } from './db.js';
import { BaseNode, Edge, NodeType } from '../schema/types.js';
import { GraphEngine } from './graph.js';
import { getCurrentBranch } from '../utils/git.js';
import { logger } from '../utils/logger.js';

export interface DependencyTraceItem {
  node: BaseNode;
  depth: number;
  edge_type: string;
}

export interface BlockerSummary {
  blocker_node: BaseNode;
  blocked_nodes: { node: BaseNode; depth: number }[];
}

export class AnalyticsEngine {
  /**
   * Trace upstream or downstream dependency chains using recursive CTEs.
   */
  static traceDependencies(params: {
    project?: string;
    node_id: string;
    direction: 'upstream' | 'downstream';
    edge_types?: string[];
    max_depth?: number;
  }): { chain: DependencyTraceItem[]; has_cycle: boolean } {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    const maxDepth = params.max_depth !== undefined ? params.max_depth : 10;
    const allowedEdgeTypes = params.edge_types && params.edge_types.length > 0
      ? params.edge_types
      : ['depends_on', 'blocks', 'child_of'];

    // Verify target node exists
    const nodeExists = db.prepare('SELECT 1 FROM nodes WHERE id = ?').get(params.node_id);
    if (!nodeExists) {
      throw new Error(`Node not found: ${params.node_id}`);
    }

    const placeholders = allowedEdgeTypes.map(() => '?').join(',');
    
    // Recursive CTE definition depending on direction
    let cteQuery = '';
    if (params.direction === 'upstream') {
      cteQuery = `
        WITH RECURSIVE dependency_chain(node_id, depth, edge_type) AS (
          SELECT ?, 0, 'root'
          UNION
          SELECT 
            CASE 
              WHEN e.type = 'depends_on' AND e.source_id = dc.node_id THEN e.target_id
              WHEN e.type = 'child_of' AND e.target_id = dc.node_id THEN e.source_id
              WHEN e.type = 'blocks' AND e.target_id = dc.node_id THEN e.source_id
            END,
            dc.depth + 1,
            e.type
          FROM dependency_chain dc
          JOIN edges e ON (
            (e.type = 'depends_on' AND e.source_id = dc.node_id) OR
            (e.type = 'child_of' AND e.target_id = dc.node_id) OR
            (e.type = 'blocks' AND e.target_id = dc.node_id)
          )
          WHERE dc.depth < ? AND e.type IN (${placeholders})
        )
        SELECT * FROM dependency_chain WHERE depth > 0
      `;
    } else {
      cteQuery = `
        WITH RECURSIVE dependency_chain(node_id, depth, edge_type) AS (
          SELECT ?, 0, 'root'
          UNION
          SELECT 
            CASE 
              WHEN e.type = 'depends_on' AND e.target_id = dc.node_id THEN e.source_id
              WHEN e.type = 'child_of' AND e.source_id = dc.node_id THEN e.target_id
              WHEN e.type = 'blocks' AND e.source_id = dc.node_id THEN e.target_id
            END,
            dc.depth + 1,
            e.type
          FROM dependency_chain dc
          JOIN edges e ON (
            (e.type = 'depends_on' AND e.target_id = dc.node_id) OR
            (e.type = 'child_of' AND e.source_id = dc.node_id) OR
            (e.type = 'blocks' AND e.source_id = dc.node_id)
          )
          WHERE dc.depth < ? AND e.type IN (${placeholders})
        )
        SELECT * FROM dependency_chain WHERE depth > 0
      `;
    }

    const queryParams = [params.node_id, maxDepth, ...allowedEdgeTypes];
    const rows = db.prepare(cteQuery).all(...queryParams) as any[];

    if (rows.length === 0) {
      return { chain: [], has_cycle: false };
    }

    // Retrieve details for all visited nodes
    const nodeIds = Array.from(new Set(rows.map(r => r.node_id)));
    const nodesRows = db.prepare(`
      SELECT * FROM nodes WHERE id IN (${nodeIds.map(() => '?').join(',')})
    `).all(...nodeIds) as any[];

    const nodesMap = new Map<string, BaseNode>();
    for (const r of nodesRows) {
      nodesMap.set(r.id, {
        id: r.id,
        type: r.type as NodeType,
        title: r.title,
        status: r.status,
        project: r.project,
        git_branch: r.git_branch,
        metadata: r.metadata ? JSON.parse(r.metadata) : {},
        tags: r.tags ? JSON.parse(r.tags) : [],
        created_at: r.created_at,
        updated_at: r.updated_at,
      });
    }

    const chain: DependencyTraceItem[] = rows
      .map((row) => ({
        node: nodesMap.get(row.node_id)!,
        depth: row.depth,
        edge_type: row.edge_type,
      }))
      .filter((item) => item.node !== undefined);

    // Detect cycles (if any node is visited twice at different depths)
    const visited = new Set<string>();
    let has_cycle = false;
    for (const item of chain) {
      if (visited.has(item.node.id)) {
        has_cycle = true;
        break;
      }
      visited.add(item.node.id);
    }

    return { chain, has_cycle };
  }

  /**
   * Find active blockers and the nodes they block.
   */
  static findBlockers(params: {
    project?: string;
    node_id?: string;
    include_transitive?: boolean;
  }): BlockerSummary[] {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    const branch = getCurrentBranch();

    if (params.node_id) {
      // Find blockers blocking a specific node
      // Trace upstream to find any active blocker nodes
      const traceResult = AnalyticsEngine.traceDependencies({
        project: projectSlug,
        node_id: params.node_id,
        direction: 'upstream',
        edge_types: ['depends_on', 'blocks', 'child_of'],
        max_depth: 15,
      });

      // Filter trace items to active blocker nodes
      const blockersInChain = traceResult.chain.filter(
        item => item.node.type === 'blocker' && item.node.status === 'active'
      );

      // Group by blocker node
      const blockerSummaries: BlockerSummary[] = blockersInChain.map((item) => {
        return {
          blocker_node: item.node,
          blocked_nodes: [
            {
              node: db.prepare('SELECT * FROM nodes WHERE id = ?').get(params.node_id) as any, // root target
              depth: item.depth,
            },
          ].map(bn => ({
            node: {
              ...bn.node,
              metadata: JSON.parse(bn.node.metadata || '{}'),
              tags: JSON.parse(bn.node.tags || '[]'),
            },
            depth: bn.depth,
          })),
        };
      });

      return blockerSummaries;
    } else {
      // Find all blockers in the project and what they block
      const blockerRows = db.prepare(`
        SELECT * FROM nodes 
        WHERE project = ? AND type = 'blocker' AND status = 'active' AND git_branch = ?
      `).all(projectSlug, branch) as any[];

      const blockerSummaries: BlockerSummary[] = [];

      for (const row of blockerRows) {
        const blockerNode: BaseNode = {
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
        };

        // Trace downstream to find blocked nodes
        const traceResult = AnalyticsEngine.traceDependencies({
          project: projectSlug,
          node_id: blockerNode.id,
          direction: 'downstream',
          edge_types: ['depends_on', 'blocks', 'child_of'],
          max_depth: 10,
        });

        const blocked_nodes = traceResult.chain.map(item => ({
          node: item.node,
          depth: item.depth,
        }));

        blockerSummaries.push({
          blocker_node: blockerNode,
          blocked_nodes,
        });
      }

      return blockerSummaries;
    }
  }

  /**
   * Get high-level summary of the project state.
   */
  static getProjectSummary(params: { project?: string }): {
    node_counts: Record<string, number>;
    status_breakdown: Record<string, Record<string, number>>;
    active_blockers: BlockerSummary[];
    recent_decisions: BaseNode[];
    progress: {
      total_tasks: number;
      completed_tasks: number;
      pct: number;
    };
  } {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    const branch = getCurrentBranch();

    // 1. Fetch node counts by type
    const countRows = db.prepare(`
      SELECT type, COUNT(*) as count FROM nodes 
      WHERE project = ? AND git_branch = ?
      GROUP BY type
    `).all(projectSlug, branch) as any[];

    const node_counts: Record<string, number> = {
      task: 0,
      decision: 0,
      artifact: 0,
      plan: 0,
      observation: 0,
      blocker: 0,
      milestone: 0,
    };

    for (const r of countRows) {
      node_counts[r.type] = r.count;
    }

    // 2. Fetch status breakdown
    const statusRows = db.prepare(`
      SELECT type, status, COUNT(*) as count FROM nodes 
      WHERE project = ? AND git_branch = ?
      GROUP BY type, status
    `).all(projectSlug, branch) as any[];

    const status_breakdown: Record<string, Record<string, number>> = {};
    for (const r of statusRows) {
      if (!status_breakdown[r.type]) {
        status_breakdown[r.type] = {};
      }
      status_breakdown[r.type][r.status] = r.count;
    }

    // 3. Fetch active blockers
    const active_blockers = AnalyticsEngine.findBlockers({ project: projectSlug });

    // 4. Fetch recent decisions
    const decisionRows = db.prepare(`
      SELECT * FROM nodes 
      WHERE project = ? AND type = 'decision' AND git_branch = ?
      ORDER BY created_at DESC 
      LIMIT 5
    `).all(projectSlug, branch) as any[];

    const recent_decisions = decisionRows.map((row) => ({
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

    // 5. Compute task progress
    const total_tasks = db.prepare(`
      SELECT COUNT(*) as count FROM nodes 
      WHERE project = ? AND type = 'task' AND status != 'cancelled' AND git_branch = ?
    `).get(projectSlug, branch) as any;

    const completed_tasks = db.prepare(`
      SELECT COUNT(*) as count FROM nodes 
      WHERE project = ? AND type = 'task' AND status = 'done' AND git_branch = ?
    `).get(projectSlug, branch) as any;

    const total = total_tasks ? total_tasks.count : 0;
    const completed = completed_tasks ? completed_tasks.count : 0;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      node_counts,
      status_breakdown,
      active_blockers,
      recent_decisions,
      progress: {
        total_tasks: total,
        completed_tasks: completed,
        pct,
      },
    };
  }

  /**
   * Trace the full chain of decisions that led to a given state.
   */
  static decisionTrail(params: {
    project?: string;
    node_id: string;
  }): { decisions: BaseNode[]; contradictions: Edge[] } {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    // Verify root decision node exists
    const rootNode = db.prepare("SELECT * FROM nodes WHERE id = ? AND type = 'decision'").get(params.node_id) as any;
    if (!rootNode) {
      throw new Error(`Decision node not found: ${params.node_id}`);
    }

    // CTE to trace upstream updates (what this decision updated)
    const upstreamTrail = db.prepare(`
      WITH RECURSIVE trail(node_id) AS (
        SELECT ?
        UNION
        SELECT e.target_id
        FROM trail t
        JOIN edges e ON e.source_id = t.node_id
        WHERE e.type = 'updates'
      )
      SELECT node_id FROM trail
    `).all(params.node_id) as any[];

    // CTE to trace downstream updates (what updated this decision)
    const downstreamTrail = db.prepare(`
      WITH RECURSIVE trail(node_id) AS (
        SELECT ?
        UNION
        SELECT e.source_id
        FROM trail t
        JOIN edges e ON e.target_id = t.node_id
        WHERE e.type = 'updates'
      )
      SELECT node_id FROM trail
    `).all(params.node_id) as any[];

    const uniqueIds = Array.from(
      new Set([
        ...upstreamTrail.map((r) => r.node_id),
        ...downstreamTrail.map((r) => r.node_id),
      ])
    );

    if (uniqueIds.length === 0) {
      return { decisions: [], contradictions: [] };
    }

    // Fetch decisions
    const placeholders = uniqueIds.map(() => '?').join(',');
    const decisionRows = db.prepare(`
      SELECT * FROM nodes WHERE id IN (${placeholders}) AND type = 'decision'
    `).all(...uniqueIds) as any[];

    const decisions = decisionRows.map((row) => ({
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

    // Find any contradictions among these decisions
    const edgeRows = db.prepare(`
      SELECT * FROM edges 
      WHERE project = ? 
        AND type = 'contradicts' 
        AND source_id IN (${placeholders}) 
        AND target_id IN (${placeholders})
    `).all(projectSlug, ...uniqueIds, ...uniqueIds) as any[];

    const contradictions = edgeRows.map((row) => ({
      id: row.id,
      source_id: row.source_id,
      target_id: row.target_id,
      type: row.type as any,
      properties: JSON.parse(row.properties || '{}'),
      project: row.project,
      git_branch: row.git_branch,
      created_at: row.created_at,
    }));

    return { decisions, contradictions };
  }

  /**
   * Compute the longest dependency path of tasks leading to a milestone.
   */
  static criticalPath(params: {
    project?: string;
    milestone_id: string;
  }): { path: BaseNode[]; total_estimate_hours: number } {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    // Verify milestone exists
    const milestone = db.prepare("SELECT * FROM nodes WHERE id = ? AND type = 'milestone'").get(params.milestone_id) as any;
    if (!milestone) {
      throw new Error(`Milestone node not found: ${params.milestone_id}`);
    }

    // Trace upstream dependencies (only active tasks)
    const trace = AnalyticsEngine.traceDependencies({
      project: projectSlug,
      node_id: params.milestone_id,
      direction: 'upstream',
      edge_types: ['depends_on', 'blocks', 'child_of'],
      max_depth: 20,
    });

    // Exclude completed or cancelled tasks
    const activeNodes = trace.chain
      .map(item => item.node)
      .filter(node => node.status !== 'done' && node.status !== 'cancelled' && (node.type === 'task' || node.type === 'milestone'));

    // Include the root milestone itself
    const rootMilestoneNode: BaseNode = {
      id: milestone.id,
      type: milestone.type as NodeType,
      title: milestone.title,
      status: milestone.status,
      project: milestone.project,
      git_branch: milestone.git_branch,
      metadata: JSON.parse(milestone.metadata || '{}'),
      tags: JSON.parse(milestone.tags || '[]'),
      created_at: milestone.created_at,
      updated_at: milestone.updated_at,
    };
    activeNodes.push(rootMilestoneNode);

    const activeNodeIds = activeNodes.map(n => n.id);
    if (activeNodeIds.length <= 1) {
      return { path: activeNodes, total_estimate_hours: 0 };
    }

    // Fetch edges among these active nodes
    const placeholders = activeNodeIds.map(() => '?').join(',');
    const edgeRows = db.prepare(`
      SELECT * FROM edges 
      WHERE project = ? 
        AND source_id IN (${placeholders}) 
        AND target_id IN (${placeholders})
    `).all(projectSlug, ...activeNodeIds, ...activeNodeIds) as any[];

    // Parse estimates as weights. Helper to parse estimates (e.g. "3h" or 3 => 3)
    const getWeight = (node: BaseNode): number => {
      const est = node.metadata.estimate;
      if (typeof est === 'number') return est;
      if (typeof est === 'string') {
        const match = est.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hours)?$/i);
        if (match) return parseFloat(match[1]);
      }
      return 1; // Default weight
    };

    // Build directed dependency DAG:
    // U -> V means U must complete before V.
    // In our relations:
    // - X depends_on Y means Y must complete before X. So Y -> X.
    // - Y blocks X means Y must complete before X. So Y -> X.
    // - X child_of Y means X is part of Y. No temporal dependency usually, but child of milestone represents Milestone depends on Task. So X -> Y.
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const node of activeNodes) {
      adj.set(node.id, []);
      inDegree.set(node.id, 0);
    }

    for (const edge of edgeRows) {
      let u = ''; // predecessor
      let v = ''; // successor
      if (edge.type === 'depends_on') {
        u = edge.target_id;
        v = edge.source_id;
      } else if (edge.type === 'blocks') {
        u = edge.source_id;
        v = edge.target_id;
      } else if (edge.type === 'child_of') {
        u = edge.source_id;
        v = edge.target_id;
      }

      if (adj.has(u) && adj.has(v)) {
        adj.get(u)!.push(v);
        inDegree.set(v, inDegree.get(v)! + 1);
      }
    }

    // Topological Sort (Kahn's algorithm)
    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const topoOrder: string[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      topoOrder.push(u);
      const neighbors = adj.get(u) || [];
      for (const v of neighbors) {
        inDegree.set(v, inDegree.get(v)! - 1);
        if (inDegree.get(v) === 0) {
          queue.push(v);
        }
      }
    }

    // Longest path in DAG
    const dist = new Map<string, number>();
    const parent = new Map<string, string>();

    const nodesMap = new Map<string, BaseNode>(activeNodes.map(n => [n.id, n]));

    for (const id of topoOrder) {
      const node = nodesMap.get(id)!;
      dist.set(id, getWeight(node));
    }

    for (const u of topoOrder) {
      const neighbors = adj.get(u) || [];
      const distU = dist.get(u) || 0;
      for (const v of neighbors) {
        const nodeV = nodesMap.get(v)!;
        const weightV = getWeight(nodeV);
        const distV = dist.get(v) || 0;
        if (distU + weightV > distV) {
          dist.set(v, distU + weightV);
          parent.set(v, u);
        }
      }
    }

    // Milestone is the sink of the critical path DAG
    // Reconstruct path to milestone
    const path: BaseNode[] = [];
    let currentId: string | undefined = params.milestone_id;
    let total_estimate_hours = dist.get(params.milestone_id) || 0;

    // Check if milestone was reached in topo order
    if (dist.has(params.milestone_id)) {
      while (currentId) {
        const node = nodesMap.get(currentId);
        if (node) path.unshift(node); // Prepend to keep chronological order
        currentId = parent.get(currentId);
      }
    }

    return { path, total_estimate_hours };
  }

  /**
   * Determine downstream affected nodes if a target node is updated/deleted.
   */
  static impactAnalysis(params: {
    project?: string;
    node_id: string;
  }): { affected_nodes: BaseNode[] } {
    const trace = AnalyticsEngine.traceDependencies({
      project: params.project,
      node_id: params.node_id,
      direction: 'downstream',
      edge_types: ['depends_on', 'blocks', 'child_of', 'updates', 'part_of', 'implements'],
      max_depth: 20,
    });

    const affected_nodes = trace.chain.map(item => item.node);
    return { affected_nodes };
  }

  /**
   * Detect inconsistencies: tasks marked done but blocked, or accepted contradicting decisions.
   */
  static detectContradictions(params: { project?: string }): {
    blocked_done_tasks: { task: BaseNode; blocker: BaseNode }[];
    contradicting_decisions: { decision1: BaseNode; decision2: BaseNode }[];
  } {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    // 1. Find tasks marked done but with active blockers
    const taskContradictions = db.prepare(`
      SELECT DISTINCT t.id as t_id, b.id as b_id
      FROM nodes t
      JOIN edges e ON e.target_id = t.id
      JOIN nodes b ON e.source_id = b.id
      WHERE t.project = ? AND t.type = 'task' AND t.status = 'done' 
        AND e.type = 'blocks' AND b.type = 'blocker' AND b.status = 'active'
    `).all(projectSlug) as any[];

    // Find tasks marked done but with uncompleted dependencies
    const depContradictions = db.prepare(`
      SELECT DISTINCT t.id as t_id, dep.id as b_id
      FROM nodes t
      JOIN edges e ON e.source_id = t.id
      JOIN nodes dep ON e.target_id = dep.id
      WHERE t.project = ? AND t.type = 'task' AND t.status = 'done'
        AND e.type = 'depends_on' AND dep.type = 'task' AND dep.status != 'done' AND dep.status != 'cancelled'
    `).all(projectSlug) as any[];

    const allBlockedDone = [...taskContradictions, ...depContradictions];

    const blocked_done_tasks: { task: BaseNode; blocker: BaseNode }[] = [];
    for (const r of allBlockedDone) {
      const taskRes = GraphEngine.getNode({ project: projectSlug, id: r.t_id, include_edges: false });
      const blockerRes = GraphEngine.getNode({ project: projectSlug, id: r.b_id, include_edges: false });
      if (taskRes && blockerRes) {
        blocked_done_tasks.push({
          task: taskRes.node,
          blocker: blockerRes.node,
        });
      }
    }

    // 2. Find contradicting accepted decisions
    const decisionContradictions = db.prepare(`
      SELECT DISTINCT d1.id as id1, d2.id as id2
      FROM edges e
      JOIN nodes d1 ON e.source_id = d1.id
      JOIN nodes d2 ON e.target_id = d2.id
      WHERE e.project = ? AND e.type = 'contradicts'
        AND d1.type = 'decision' AND d1.status = 'accepted'
        AND d2.type = 'decision' AND d2.status = 'accepted'
    `).all(projectSlug) as any[];

    const contradicting_decisions: { decision1: BaseNode; decision2: BaseNode }[] = [];
    for (const r of decisionContradictions) {
      const d1Res = GraphEngine.getNode({ project: projectSlug, id: r.id1, include_edges: false });
      const d2Res = GraphEngine.getNode({ project: projectSlug, id: r.id2, include_edges: false });
      if (d1Res && d2Res) {
        contradicting_decisions.push({
          decision1: d1Res.node,
          decision2: d2Res.node,
        });
      }
    }

    return { blocked_done_tasks, contradicting_decisions };
  }

  /**
   * Get a comprehensive high-level context snapshot combining summary, active blockers, and immediate pending tasks.
   */
  static getContextSnapshot(params: { project?: string }): {
    summary: {
      node_counts: Record<string, number>;
      progress: { total_tasks: number; completed_tasks: number; pct: number };
    };
    active_blockers: BlockerSummary[];
    pending_tasks: BaseNode[];
    formatted_summary: string;
  } {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);
    const summary = AnalyticsEngine.getProjectSummary({ project: projectSlug });

    // Fetch immediate pending tasks
    const branch = getCurrentBranch();
    const taskRows = db.prepare(`
      SELECT * FROM nodes 
      WHERE project = ? AND type = 'task' AND status = 'pending' AND git_branch = ?
      LIMIT 10
    `).all(projectSlug, branch) as any[];

    const pending_tasks = taskRows.map((row) => ({
      id: row.id,
      type: row.type as NodeType,
      title: row.title,
      status: row.status,
      project: row.project,
      git_branch: row.git_branch,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      tags: row.tags ? JSON.parse(row.tags) : [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    // Pre-render a beautiful Markdown summary
    let md = `## 📊 State Graph Context Snapshot [Project: ${projectSlug}]\n\n`;
    md += `### Task Progress\n`;
    const total = summary.progress.total_tasks;
    const completed = summary.progress.completed_tasks;
    const pct = summary.progress.pct;
    
    // Simple ASCII progress bar
    const barWidth = 20;
    const filledWidth = Math.round((pct / 100) * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const bar = '[' + '='.repeat(filledWidth) + ' '.repeat(emptyWidth) + ']';
    
    md += `\`${bar} ${pct}%\` (${completed}/${total} tasks completed)\n\n`;

    md += `### 🔴 Active Blockers (${summary.active_blockers.length})\n`;
    if (summary.active_blockers.length === 0) {
      md += `*No active blockers.* 🎉\n\n`;
    } else {
      for (const b of summary.active_blockers) {
        md += `- **Blocker**: ${b.blocker_node.title} (ID: \`${b.blocker_node.id}\`)\n`;
        if (b.blocked_nodes.length > 0) {
          md += `  - Blocks: ${b.blocked_nodes.map(n => `\`${n.node.title}\` (ID: \`${n.node.id}\`)`).join(', ')}\n`;
        }
      }
      md += `\n`;
    }

    md += `### 📋 Immediate Pending Tasks (Showing top ${pending_tasks.length})\n`;
    if (pending_tasks.length === 0) {
      md += `*No pending tasks.* 👍\n\n`;
    } else {
      for (const t of pending_tasks) {
        const priority = t.metadata.priority ? ` [Priority: ${t.metadata.priority}]` : '';
        md += `- **${t.title}** (ID: \`${t.id}\`)${priority}\n`;
      }
      md += `\n`;
    }

    md += `### 📦 Graph Node Breakdown\n`;
    for (const [type, count] of Object.entries(summary.node_counts)) {
      if (count > 0) {
        md += `- **${type}**: ${count}\n`;
      }
    }

    return {
      summary: {
        node_counts: summary.node_counts,
        progress: summary.progress,
      },
      active_blockers: summary.active_blockers,
      pending_tasks,
      formatted_summary: md,
    };
  }

  /**
   * Find all decisions that affected a given artifact (either directly produces it or decided_in a milestone that produces it)
   */
  static findRelatedDecisions(params: {
    project?: string;
    artifact_id: string;
  }): BaseNode[] {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    // Verify artifact exists
    const artExists = db.prepare("SELECT 1 FROM nodes WHERE id = ? AND type = 'artifact'").get(params.artifact_id);
    if (!artExists) {
      throw new Error(`Artifact node not found: ${params.artifact_id}`);
    }

    const rows = db.prepare(`
      SELECT DISTINCT d.* 
      FROM nodes d
      LEFT JOIN edges e1 ON e1.source_id = d.id AND e1.type = 'produces'
      LEFT JOIN edges e2 ON e2.source_id = d.id AND e2.type = 'decided_in'
      LEFT JOIN edges e3 ON e3.source_id = e2.target_id AND e3.type = 'produces'
      WHERE d.project = ? AND d.type = 'decision'
        AND (e1.target_id = ? OR e3.target_id = ?)
    `).all(projectSlug, params.artifact_id, params.artifact_id) as any[];

    return rows.map((row) => ({
      id: row.id,
      type: row.type as NodeType,
      title: row.title,
      status: row.status,
      project: row.project,
      git_branch: row.git_branch,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      tags: row.tags ? JSON.parse(row.tags) : [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  /**
   * List all tasks blocked by a given decision node (either directly or transitively)
   */
  static findBlockedTasks(params: {
    project?: string;
    decision_id: string;
  }): BaseNode[] {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    // Verify decision exists
    const decExists = db.prepare("SELECT 1 FROM nodes WHERE id = ? AND type = 'decision'").get(params.decision_id);
    if (!decExists) {
      throw new Error(`Decision node not found: ${params.decision_id}`);
    }

    const trace = AnalyticsEngine.traceDependencies({
      project: projectSlug,
      node_id: params.decision_id,
      direction: 'downstream',
      edge_types: ['depends_on', 'blocks', 'child_of', 'decided_in', 'part_of', 'implements'],
      max_depth: 20,
    });

    return trace.chain
      .map(item => item.node)
      .filter(node => node.type === 'task');
  }
}

