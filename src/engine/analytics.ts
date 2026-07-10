import { getDb, getProjectSlug } from './db.js';
import { BaseNode, Edge, NodeRow, EdgeRow } from '../schema/types.js';
import { GraphEngine } from './graph.js';
import { getCurrentBranch } from '../utils/git.js';
import { parseNodeRow, parseEdgeRow } from './row-mappers.js';

/**
 * Represents an item in a dependency trace path, detailing a node, its depth, and the edge type.
 */
export interface DependencyTraceItem {
  node: BaseNode;
  depth: number;
  edge_type: string;
}

/**
 * Represents a summary of an active blocker and the nodes it directly or transitively blocks.
 */
export interface BlockerSummary {
  blocker_node: BaseNode;
  blocked_nodes: { node: BaseNode; depth: number }[];
}

/**
 * Engine for performing graph analytics, path tracing, blocker discovery, and impact analysis.
 */
export class AnalyticsEngine {
  /**
   * Trace upstream or downstream dependency chains using recursive CTEs.
   *
   * @param params - The trace parameters.
   * @param params.project - Optional project identifier.
   * @param params.node_id - The ID of the node to trace from.
   * @param params.direction - The direction of tracing ('upstream' to trace dependencies, 'downstream' to trace dependents).
   * @param params.edge_types - Optional array of edge types to traverse.
   * @param params.max_depth - Optional maximum traversal depth (defaults to 10).
   * @returns An object containing the dependency chain and a boolean indicating if a cycle was detected.
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
    const allowedEdgeTypes =
      params.edge_types && params.edge_types.length > 0
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
    const nodeIds = Array.from(new Set(rows.map((r) => r.node_id)));
    const nodesRows = db
      .prepare(
        `
      SELECT * FROM nodes WHERE id IN (${nodeIds.map(() => '?').join(',')})
    `
      )
      .all(...nodeIds) as any[];

    const nodesMap = new Map<string, BaseNode>();
    for (const r of nodesRows) {
      nodesMap.set(r.id, parseNodeRow(r as NodeRow));
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
   *
   * @param params - The blocker search parameters.
   * @param params.project - Optional project identifier.
   * @param params.node_id - Optional node ID to check blockers specifically for.
   * @param params.include_transitive - Optional. Whether to search transitively.
   * @returns An array of blocker summaries.
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
        (item) => item.node.type === 'blocker' && item.node.status === 'active'
      );

      // Group by blocker node
      const blockerSummaries: BlockerSummary[] = blockersInChain.map((item) => {
        return {
          blocker_node: item.node,
          blocked_nodes: [
            {
              node: parseNodeRow(
                db.prepare('SELECT * FROM nodes WHERE id = ?').get(params.node_id) as NodeRow
              ), // root target
              depth: item.depth,
            },
          ],
        };
      });

      return blockerSummaries;
    } else {
      // Find all blockers in the project and what they block
      const blockerRows = db
        .prepare(
          `
        SELECT * FROM nodes 
        WHERE project = ? AND type = 'blocker' AND status = 'active' AND git_branch = ?
      `
        )
        .all(projectSlug, branch) as NodeRow[];

      const blockerSummaries: BlockerSummary[] = [];

      for (const row of blockerRows) {
        const blockerNode = parseNodeRow(row);

        // Trace downstream to find blocked nodes
        const traceResult = AnalyticsEngine.traceDependencies({
          project: projectSlug,
          node_id: blockerNode.id,
          direction: 'downstream',
          edge_types: ['depends_on', 'blocks', 'child_of'],
          max_depth: 10,
        });

        const blocked_nodes = traceResult.chain.map((item) => ({
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
   *
   * @param params - The summary parameters.
   * @param params.project - Optional project identifier.
   * @returns An object containing node counts, status breakdown, active blockers, recent decisions, and task progress.
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
    const countRows = db
      .prepare(
        `
      SELECT type, COUNT(*) as count FROM nodes 
      WHERE project = ? AND git_branch = ?
      GROUP BY type
    `
      )
      .all(projectSlug, branch) as any[];

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
    const statusRows = db
      .prepare(
        `
      SELECT type, status, COUNT(*) as count FROM nodes 
      WHERE project = ? AND git_branch = ?
      GROUP BY type, status
    `
      )
      .all(projectSlug, branch) as any[];

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
    const decisionRows = db
      .prepare(
        `
      SELECT * FROM nodes 
      WHERE project = ? AND type = 'decision' AND git_branch = ?
      ORDER BY created_at DESC 
      LIMIT 5
    `
      )
      .all(projectSlug, branch) as NodeRow[];

    const recent_decisions = decisionRows.map(parseNodeRow);

    // 5. Compute task progress
    const total_tasks = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM nodes 
      WHERE project = ? AND type = 'task' AND status != 'cancelled' AND git_branch = ?
    `
      )
      .get(projectSlug, branch) as any;

    const completed_tasks = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM nodes 
      WHERE project = ? AND type = 'task' AND status = 'done' AND git_branch = ?
    `
      )
      .get(projectSlug, branch) as any;

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
   *
   * @param params - The trail parameters.
   * @param params.project - Optional project identifier.
   * @param params.node_id - The target decision node ID.
   * @returns An object containing the trail of decision nodes and any contradiction edges.
   */
  static decisionTrail(params: { project?: string; node_id: string }): {
    decisions: BaseNode[];
    contradictions: Edge[];
  } {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    // Verify root decision node exists
    const rootNode = db
      .prepare("SELECT * FROM nodes WHERE id = ? AND type = 'decision'")
      .get(params.node_id) as any;
    if (!rootNode) {
      throw new Error(`Decision node not found: ${params.node_id}`);
    }

    // CTE to trace upstream updates (what this decision updated)
    const upstreamTrail = db
      .prepare(
        `
      WITH RECURSIVE trail(node_id) AS (
        SELECT ?
        UNION
        SELECT e.target_id
        FROM trail t
        JOIN edges e ON e.source_id = t.node_id
        WHERE e.type = 'updates'
      )
      SELECT node_id FROM trail
    `
      )
      .all(params.node_id) as any[];

    // CTE to trace downstream updates (what updated this decision)
    const downstreamTrail = db
      .prepare(
        `
      WITH RECURSIVE trail(node_id) AS (
        SELECT ?
        UNION
        SELECT e.source_id
        FROM trail t
        JOIN edges e ON e.target_id = t.node_id
        WHERE e.type = 'updates'
      )
      SELECT node_id FROM trail
    `
      )
      .all(params.node_id) as any[];

    const uniqueIds = Array.from(
      new Set([...upstreamTrail.map((r) => r.node_id), ...downstreamTrail.map((r) => r.node_id)])
    );

    if (uniqueIds.length === 0) {
      return { decisions: [], contradictions: [] };
    }

    // Fetch decisions
    const placeholders = uniqueIds.map(() => '?').join(',');
    const decisionRows = db
      .prepare(
        `
      SELECT * FROM nodes WHERE id IN (${placeholders}) AND type = 'decision'
    `
      )
      .all(...uniqueIds) as NodeRow[];

    const decisions = decisionRows.map(parseNodeRow);

    // Find any contradictions among these decisions
    const edgeRows = db
      .prepare(
        `
      SELECT * FROM edges 
      WHERE project = ? 
        AND type = 'contradicts' 
        AND source_id IN (${placeholders}) 
        AND target_id IN (${placeholders})
    `
      )
      .all(projectSlug, ...uniqueIds, ...uniqueIds) as EdgeRow[];

    const contradictions = edgeRows.map(parseEdgeRow);

    return { decisions, contradictions };
  }

  /**
   * Compute the longest dependency path of tasks leading to a milestone.
   *
   * @param params - The path parameters.
   * @param params.project - Optional project identifier.
   * @param params.milestone_id - The milestone node ID.
   * @returns An object containing the path nodes and the total estimated duration in hours.
   */
  static criticalPath(params: { project?: string; milestone_id: string }): {
    path: BaseNode[];
    total_estimate_hours: number;
  } {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    // Verify milestone exists
    const milestone = db
      .prepare("SELECT * FROM nodes WHERE id = ? AND type = 'milestone'")
      .get(params.milestone_id) as NodeRow | undefined;
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
      .map((item) => item.node)
      .filter(
        (node) =>
          node.status !== 'done' &&
          node.status !== 'cancelled' &&
          (node.type === 'task' || node.type === 'milestone')
      );

    // Include the root milestone itself
    const rootMilestoneNode = parseNodeRow(milestone);
    activeNodes.push(rootMilestoneNode);

    const activeNodeIds = activeNodes.map((n) => n.id);
    if (activeNodeIds.length <= 1) {
      return { path: activeNodes, total_estimate_hours: 0 };
    }

    // Fetch edges among these active nodes
    const placeholders = activeNodeIds.map(() => '?').join(',');
    const edgeRows = db
      .prepare(
        `
      SELECT * FROM edges 
      WHERE project = ? 
        AND source_id IN (${placeholders}) 
        AND target_id IN (${placeholders})
    `
      )
      .all(projectSlug, ...activeNodeIds, ...activeNodeIds) as EdgeRow[];

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

    const nodesMap = new Map<string, BaseNode>(activeNodes.map((n) => [n.id, n]));

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
    const total_estimate_hours = dist.get(params.milestone_id) || 0;

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
   *
   * @param params - The analysis parameters.
   * @param params.project - Optional project identifier.
   * @param params.node_id - The target node ID.
   * @returns An object containing the list of affected downstream nodes.
   */
  static impactAnalysis(params: { project?: string; node_id: string }): {
    affected_nodes: BaseNode[];
  } {
    const trace = AnalyticsEngine.traceDependencies({
      project: params.project,
      node_id: params.node_id,
      direction: 'downstream',
      edge_types: ['depends_on', 'blocks', 'child_of', 'updates', 'part_of', 'implements'],
      max_depth: 20,
    });

    const affected_nodes = trace.chain.map((item) => item.node);
    return { affected_nodes };
  }

  /**
   * Detect inconsistencies: tasks marked done but blocked, or accepted contradicting decisions.
   *
   * @param params - The detection parameters.
   * @param params.project - Optional project identifier.
   * @returns An object containing lists of blocked-but-done tasks and contradicting decision nodes.
   */
  static detectContradictions(params: { project?: string }): {
    blocked_done_tasks: { task: BaseNode; blocker: BaseNode }[];
    contradicting_decisions: { decision1: BaseNode; decision2: BaseNode }[];
  } {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    // 1. Find tasks marked done but with active blockers
    const taskContradictions = db
      .prepare(
        `
      SELECT DISTINCT t.id as t_id, b.id as b_id
      FROM nodes t
      JOIN edges e ON e.target_id = t.id
      JOIN nodes b ON e.source_id = b.id
      WHERE t.project = ? AND t.type = 'task' AND t.status = 'done' 
        AND e.type = 'blocks' AND b.type = 'blocker' AND b.status = 'active'
    `
      )
      .all(projectSlug) as any[];

    // Find tasks marked done but with uncompleted dependencies
    const depContradictions = db
      .prepare(
        `
      SELECT DISTINCT t.id as t_id, dep.id as b_id
      FROM nodes t
      JOIN edges e ON e.source_id = t.id
      JOIN nodes dep ON e.target_id = dep.id
      WHERE t.project = ? AND t.type = 'task' AND t.status = 'done'
        AND e.type = 'depends_on' AND dep.type = 'task' AND dep.status != 'done' AND dep.status != 'cancelled'
    `
      )
      .all(projectSlug) as any[];

    const allBlockedDone = [...taskContradictions, ...depContradictions];

    const blocked_done_tasks: { task: BaseNode; blocker: BaseNode }[] = [];
    for (const r of allBlockedDone) {
      const taskRes = GraphEngine.getNode({
        project: projectSlug,
        id: r.t_id,
        include_edges: false,
      });
      const blockerRes = GraphEngine.getNode({
        project: projectSlug,
        id: r.b_id,
        include_edges: false,
      });
      if (taskRes && blockerRes) {
        blocked_done_tasks.push({
          task: taskRes.node,
          blocker: blockerRes.node,
        });
      }
    }

    // 2. Find contradicting accepted decisions
    const decisionContradictions = db
      .prepare(
        `
      SELECT DISTINCT d1.id as id1, d2.id as id2
      FROM edges e
      JOIN nodes d1 ON e.source_id = d1.id
      JOIN nodes d2 ON e.target_id = d2.id
      WHERE e.project = ? AND e.type = 'contradicts'
        AND d1.type = 'decision' AND d1.status = 'accepted'
        AND d2.type = 'decision' AND d2.status = 'accepted'
    `
      )
      .all(projectSlug) as any[];

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
   *
   * @param params - The snapshot parameters.
   * @param params.project - Optional project identifier.
   * @returns A snapshot object containing progress, active blockers, pending tasks, and a formatted Markdown summary string.
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
    const taskRows = db
      .prepare(
        `
      SELECT * FROM nodes 
      WHERE project = ? AND type = 'task' AND status = 'pending' AND git_branch = ?
      LIMIT 10
    `
      )
      .all(projectSlug, branch) as NodeRow[];

    const pending_tasks = taskRows.map(parseNodeRow);

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
          md += `  - Blocks: ${b.blocked_nodes.map((n) => `\`${n.node.title}\` (ID: \`${n.node.id}\`)`).join(', ')}\n`;
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
   * Find all decisions that affected a given artifact (either directly produces it or decided_in a milestone that produces it).
   *
   * @param params - The search parameters.
   * @param params.project - Optional project identifier.
   * @param params.artifact_id - The unique ID of the artifact node.
   * @returns An array of related decision nodes.
   */
  static findRelatedDecisions(params: { project?: string; artifact_id: string }): BaseNode[] {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    // Verify artifact exists
    const artExists = db
      .prepare("SELECT 1 FROM nodes WHERE id = ? AND type = 'artifact'")
      .get(params.artifact_id);
    if (!artExists) {
      throw new Error(`Artifact node not found: ${params.artifact_id}`);
    }

    const rows = db
      .prepare(
        `
      SELECT DISTINCT d.* 
      FROM nodes d
      LEFT JOIN edges e1 ON e1.source_id = d.id AND e1.type = 'produces'
      LEFT JOIN edges e2 ON e2.source_id = d.id AND e2.type = 'decided_in'
      LEFT JOIN edges e3 ON e3.source_id = e2.target_id AND e3.type = 'produces'
      WHERE d.project = ? AND d.type = 'decision'
        AND (e1.target_id = ? OR e3.target_id = ?)
    `
      )
      .all(projectSlug, params.artifact_id, params.artifact_id) as NodeRow[];

    return rows.map(parseNodeRow);
  }

  /**
   * List all tasks blocked by a given decision node (either directly or transitively).
   *
   * @param params - The query parameters.
   * @param params.project - Optional project identifier.
   * @param params.decision_id - The unique ID of the decision node.
   * @returns An array of blocked task nodes.
   */
  static findBlockedTasks(params: { project?: string; decision_id: string }): BaseNode[] {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    // Verify decision exists
    const decExists = db
      .prepare("SELECT 1 FROM nodes WHERE id = ? AND type = 'decision'")
      .get(params.decision_id);
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

    return trace.chain.map((item) => item.node).filter((node) => node.type === 'task');
  }

  /**
   * Computes metric estimations showing the productivity ROI and health of the project graph.
   *
   * @param params - Parameters for metrics generation.
   * @param params.project - Optional project identifier.
   * @returns Detailed object containing counts, token estimates, time estimates, graph health, and a pre-rendered Markdown report.
   */
  static valueMetrics(params: { project?: string }): {
    total_nodes: number;
    total_edges: number;
    graph_age_days: number;
    estimated_sessions: number;
    context_switches_saved: number;
    dependency_lookups_saved: number;
    estimated_tokens_stored: number;
    estimated_tokens_saved: number;
    estimated_time_saved_minutes: number;
    graph_density: number;
    average_degree: number;
    orphan_node_count: number;
    decision_reuse_rate: number;
    contradiction_count: number;
    task_completion_rate: number;
    task_velocity_per_day: number;
    blocker_avg_resolution_hours: number;
    blocker_active_count: number;
    artifact_freshness_rate: number;
    plan_completion_rate: number;
    markdown_summary: string;
  } {
    const projectSlug = getProjectSlug(params.project);
    const db = getDb(projectSlug);

    // 1. Core Counts
    const nodeCount = (
      db.prepare('SELECT COUNT(*) as count FROM nodes WHERE project = ?').get(projectSlug) as {
        count: number;
      }
    ).count;
    const edgeCount = (
      db.prepare('SELECT COUNT(*) as count FROM edges WHERE project = ?').get(projectSlug) as {
        count: number;
      }
    ).count;

    // 2. Graph Age & Session Estimates
    const ageRow = db
      .prepare(
        'SELECT MIN(created_at) as first, MAX(created_at) as last FROM nodes WHERE project = ?'
      )
      .get(projectSlug) as { first: string | null; last: string | null };
    let graphAgeDays = 1;
    if (ageRow?.first && ageRow?.last) {
      const first = new Date(ageRow.first).getTime();
      const last = new Date(ageRow.last).getTime();
      graphAgeDays = Math.max(1, Math.ceil((last - first) / (1000 * 60 * 60 * 24)));
    }

    const sessionRow = db
      .prepare('SELECT COUNT(DISTINCT date(created_at)) as count FROM nodes WHERE project = ?')
      .get(projectSlug) as { count: number };
    const estimatedSessions = Math.max(1, sessionRow?.count || 1);

    // 3. Savings: Context Switches & Dependency Lookups
    const acceptedDecisions = (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM nodes WHERE project = ? AND type = 'decision' AND status = 'accepted'"
        )
        .get(projectSlug) as { count: number }
    ).count;
    const structuralEdges = (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM edges WHERE project = ? AND type IN ('depends_on', 'blocks', 'child_of', 'implements', 'part_of')"
        )
        .get(projectSlug) as { count: number }
    ).count;

    // Resolved blockers count and resolution times
    const resolvedBlockers = db
      .prepare(
        "SELECT created_at, updated_at FROM nodes WHERE project = ? AND type = 'blocker' AND status IN ('resolved', 'mitigated')"
      )
      .all(projectSlug) as { created_at: string; updated_at: string }[];
    let totalBlockerResHours = 0;
    for (const b of resolvedBlockers) {
      const start = new Date(b.created_at).getTime();
      const end = new Date(b.updated_at).getTime();
      totalBlockerResHours += Math.max(0, (end - start) / (1000 * 60 * 60));
    }
    const blockerAvgResHours =
      resolvedBlockers.length > 0
        ? Number((totalBlockerResHours / resolvedBlockers.length).toFixed(1))
        : 0;
    const blockerActiveCount = (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM nodes WHERE project = ? AND type = 'blocker' AND status = 'active'"
        )
        .get(projectSlug) as { count: number }
    ).count;

    // Time saved calculation (heuristics)
    const timeSavedFromDecisions = acceptedDecisions * 10; // 10 minutes per recorded decision
    const timeSavedFromDependencies = structuralEdges * 3; // 3 minutes per mapped dependency edge
    const timeSavedFromBlockers = resolvedBlockers.length * 15; // 15 minutes per resolved blocker
    const estimatedTimeSaved =
      timeSavedFromDecisions + timeSavedFromDependencies + timeSavedFromBlockers;

    // 4. Token Estimates
    const nodeTextLength =
      (
        db
          .prepare(
            'SELECT SUM(LENGTH(title) + LENGTH(metadata)) as len FROM nodes WHERE project = ?'
          )
          .get(projectSlug) as { len: number | null }
      ).len || 0;
    const edgeTextLength =
      (
        db
          .prepare('SELECT SUM(LENGTH(properties)) as len FROM edges WHERE project = ?')
          .get(projectSlug) as { len: number | null }
      ).len || 0;
    const totalChars = nodeTextLength + edgeTextLength;
    const estimatedTokensStored = Math.ceil(totalChars / 4);
    // Across estimated sessions, we reuse this captured context
    const estimatedTokensSaved = estimatedTokensStored * estimatedSessions;

    // 5. Graph Health & Connectivity Metrics
    const graphDensity =
      nodeCount > 1 ? Number((edgeCount / (nodeCount * (nodeCount - 1))).toFixed(4)) : 0;
    const averageDegree = nodeCount > 0 ? Number(((2 * edgeCount) / nodeCount).toFixed(2)) : 0;
    const orphanCount = (
      db
        .prepare(
          `
      SELECT COUNT(*) as count FROM nodes n
      WHERE n.project = ?
        AND NOT EXISTS (
          SELECT 1 FROM edges e
          WHERE e.project = ? AND (e.source_id = n.id OR e.target_id = n.id)
        )
    `
        )
        .get(projectSlug, projectSlug) as { count: number }
    ).count;

    const usedDecisions = (
      db
        .prepare(
          `
      SELECT COUNT(DISTINCT n.id) as count FROM nodes n 
      JOIN edges e ON e.source_id = n.id AND e.type IN ('updates', 'decided_in', 'implements', 'produces')
      WHERE n.project = ? AND n.type = 'decision' AND n.status = 'accepted'
    `
        )
        .get(projectSlug) as { count: number }
    ).count;
    const decisionReuseRate =
      acceptedDecisions > 0 ? Number((usedDecisions / acceptedDecisions).toFixed(2)) : 0;

    const contradictions = AnalyticsEngine.detectContradictions({ project: projectSlug });
    const contradictionCount =
      contradictions.blocked_done_tasks.length + contradictions.contradicting_decisions.length;

    // 6. Velocity & Lifecycles
    const totalTasks = (
      db
        .prepare("SELECT COUNT(*) as count FROM nodes WHERE project = ? AND type = 'task'")
        .get(projectSlug) as { count: number }
    ).count;
    const doneTasks = (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM nodes WHERE project = ? AND type = 'task' AND status = 'done'"
        )
        .get(projectSlug) as { count: number }
    ).count;
    const taskCompletionRate = totalTasks > 0 ? Number((doneTasks / totalTasks).toFixed(2)) : 0;
    const taskVelocity = Number((doneTasks / graphAgeDays).toFixed(2));

    const totalArtifacts = (
      db
        .prepare("SELECT COUNT(*) as count FROM nodes WHERE project = ? AND type = 'artifact'")
        .get(projectSlug) as { count: number }
    ).count;
    const currentArtifacts = (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM nodes WHERE project = ? AND type = 'artifact' AND status = 'current'"
        )
        .get(projectSlug) as { count: number }
    ).count;
    const artifactFreshnessRate =
      totalArtifacts > 0 ? Number((currentArtifacts / totalArtifacts).toFixed(2)) : 0;

    const totalPlansNonDraft = (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM nodes WHERE project = ? AND type = 'plan' AND status != 'draft'"
        )
        .get(projectSlug) as { count: number }
    ).count;
    const completedPlans = (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM nodes WHERE project = ? AND type = 'plan' AND status = 'completed'"
        )
        .get(projectSlug) as { count: number }
    ).count;
    const planCompletionRate =
      totalPlansNonDraft > 0 ? Number((completedPlans / totalPlansNonDraft).toFixed(2)) : 0;

    // 7. Pre-render Markdown Report
    const hoursSaved = (estimatedTimeSaved / 60).toFixed(1);
    const densityPercent = (graphDensity * 100).toFixed(2);
    const reusePercent = (decisionReuseRate * 100).toFixed(0);
    const taskPercent = (taskCompletionRate * 100).toFixed(0);
    const freshnessPercent = (artifactFreshnessRate * 100).toFixed(0);

    const markdownSummary = `
# 📊 State Graph Value & ROI Metrics — "${projectSlug}"

Estimated value added by using the workflow state graph:

### 🚀 Productivity ROI Estimates
* **Estimated Time Saved**: **${hoursSaved} hours** (~${estimatedTimeSaved} minutes)
  * Avoided context-switching: **${acceptedDecisions} accepted decisions** documented (~${timeSavedFromDecisions} min saved).
  * Avoided dependency lookups: **${structuralEdges} structural edges** mapped (~${timeSavedFromDependencies} min saved).
  * Avoided blocker stalls: **${resolvedBlockers.length} blockers** resolved (~${timeSavedFromBlockers} min saved).
* **Estimated Token Savings**: **${estimatedTokensSaved.toLocaleString()} tokens**
  * Stored context: **${estimatedTokensStored.toLocaleString()} tokens** captured across nodes and relationships.
  * Reused context: Saved over **${estimatedSessions} development sessions** by preventing manual context reconstruction.

### 📈 Graph Health & Structure
* **Total Nodes / Edges**: **${nodeCount}** nodes / **${edgeCount}** edges
* **Graph Density**: **${densityPercent}%** (avg degree **${averageDegree}**)
* **Orphan Nodes**: **${orphanCount}** (unlinked)
* **Decision Reuse Rate**: **${reusePercent}%** of accepted decisions are connected to downstream tasks or milestones.
* **Contradictions**: **${contradictionCount}** active anomalies detected.

### ⏱️ Velocity & Lifecycle Health
* **Task Completion Rate**: **${taskPercent}%** (${doneTasks} of ${totalTasks} tasks completed).
* **Task Velocity**: **${taskVelocity} tasks/day** completed.
* **Average Blocker Resolution**: **${blockerAvgResHours} hours**.
* **Active Blockers / Blocker Age**: **${blockerActiveCount}** active blockers.
* **Artifact Freshness**: **${freshnessPercent}%** current artifacts.
* **Roadmap Plan Progress**: **${(planCompletionRate * 100).toFixed(0)}%** plans completed.
`.trim();

    return {
      total_nodes: nodeCount,
      total_edges: edgeCount,
      graph_age_days: graphAgeDays,
      estimated_sessions: estimatedSessions,
      context_switches_saved: acceptedDecisions,
      dependency_lookups_saved: structuralEdges,
      estimated_tokens_stored: estimatedTokensStored,
      estimated_tokens_saved: estimatedTokensSaved,
      estimated_time_saved_minutes: estimatedTimeSaved,
      graph_density: graphDensity,
      average_degree: averageDegree,
      orphan_node_count: orphanCount,
      decision_reuse_rate: decisionReuseRate,
      contradiction_count: contradictionCount,
      task_completion_rate: taskCompletionRate,
      task_velocity_per_day: taskVelocity,
      blocker_avg_resolution_hours: blockerAvgResHours,
      blocker_active_count: blockerActiveCount,
      artifact_freshness_rate: artifactFreshnessRate,
      plan_completion_rate: planCompletionRate,
      markdown_summary: markdownSummary,
    };
  }
}
