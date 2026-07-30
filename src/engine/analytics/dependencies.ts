import { getDb, getProjectSlug } from '../db.js';
import { BaseNode, NodeRow } from '../../schema/types.js';
import { getCurrentBranch } from '../../utils/git.js';
import { parseNodeRow } from '../row-mappers.js';
import { searchTfidf } from '../tfidf.js';

export interface DependencyTraceItem {
  node: BaseNode;
  depth: number;
  edge_type: string;
}

export interface BlockerSummary {
  blocker_node: BaseNode;
  blocked_nodes: { node: BaseNode; depth: number }[];
}

export function traceDependencies(params: {
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

  const nodeExists = db.prepare('SELECT 1 FROM nodes WHERE id = ?').get(params.node_id);
  if (!nodeExists) {
    throw new Error(`Node not found: ${params.node_id}`);
  }

  const placeholders = allowedEdgeTypes.map(() => '?').join(',');

  let cteQuery = '';
  if (params.direction === 'upstream') {
    cteQuery = `
      WITH RECURSIVE dependency_chain(node_id, depth, edge_type, path_str) AS (
        SELECT ?, 0, 'root', ',' || ? || ','
        UNION
        SELECT 
          CASE 
            WHEN e.type = 'depends_on' AND e.source_id = dc.node_id THEN e.target_id
            WHEN e.type = 'child_of' AND e.target_id = dc.node_id THEN e.source_id
            WHEN e.type = 'blocks' AND e.target_id = dc.node_id THEN e.source_id
          END,
          dc.depth + 1,
          e.type,
          dc.path_str || (
            CASE 
              WHEN e.type = 'depends_on' AND e.source_id = dc.node_id THEN e.target_id
              WHEN e.type = 'child_of' AND e.target_id = dc.node_id THEN e.source_id
              WHEN e.type = 'blocks' AND e.target_id = dc.node_id THEN e.source_id
            END
          ) || ','
        FROM dependency_chain dc
        JOIN edges e ON (
          (e.type = 'depends_on' AND e.source_id = dc.node_id) OR
          (e.type = 'child_of' AND e.target_id = dc.node_id) OR
          (e.type = 'blocks' AND e.target_id = dc.node_id)
        )
        WHERE dc.depth < ? AND e.type IN (${placeholders})
          AND INSTR(dc.path_str, ',' || (
            CASE 
              WHEN e.type = 'depends_on' AND e.source_id = dc.node_id THEN e.target_id
              WHEN e.type = 'child_of' AND e.target_id = dc.node_id THEN e.source_id
              WHEN e.type = 'blocks' AND e.target_id = dc.node_id THEN e.source_id
            END
          ) || ',') = 0
      )
      SELECT * FROM dependency_chain WHERE depth > 0
    `;
  } else {
    cteQuery = `
      WITH RECURSIVE dependency_chain(node_id, depth, edge_type, path_str) AS (
        SELECT ?, 0, 'root', ',' || ? || ','
        UNION
        SELECT 
          CASE 
            WHEN e.type = 'depends_on' AND e.target_id = dc.node_id THEN e.source_id
            WHEN e.type = 'child_of' AND e.source_id = dc.node_id THEN e.target_id
            WHEN e.type = 'blocks' AND e.source_id = dc.node_id THEN e.target_id
          END,
          dc.depth + 1,
          e.type,
          dc.path_str || (
            CASE 
              WHEN e.type = 'depends_on' AND e.target_id = dc.node_id THEN e.source_id
              WHEN e.type = 'child_of' AND e.source_id = dc.node_id THEN e.target_id
              WHEN e.type = 'blocks' AND e.source_id = dc.node_id THEN e.target_id
            END
          ) || ','
        FROM dependency_chain dc
        JOIN edges e ON (
          (e.type = 'depends_on' AND e.target_id = dc.node_id) OR
          (e.type = 'child_of' AND e.source_id = dc.node_id) OR
          (e.type = 'blocks' AND e.source_id = dc.node_id)
        )
        WHERE dc.depth < ? AND e.type IN (${placeholders})
          AND INSTR(dc.path_str, ',' || (
            CASE 
              WHEN e.type = 'depends_on' AND e.target_id = dc.node_id THEN e.source_id
              WHEN e.type = 'child_of' AND e.source_id = dc.node_id THEN e.target_id
              WHEN e.type = 'blocks' AND e.source_id = dc.node_id THEN e.target_id
            END
          ) || ',') = 0
      )
      SELECT * FROM dependency_chain WHERE depth > 0
    `;
  }

  const queryParams = [params.node_id, params.node_id, maxDepth, ...allowedEdgeTypes];
  const rows = db.prepare(cteQuery).all(...queryParams) as any[];

  if (rows.length === 0) {
    return { chain: [], has_cycle: false };
  }

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

  // Check cycle by verifying if any node in chain has an edge pointing back to a prior ancestor in its path
  let has_cycle = false;
  for (const r of rows) {
    const pathNodes = r.path_str.split(',').filter(Boolean);
    const priorNodes = pathNodes.slice(0, -1);
    if (priorNodes.length === 0) continue;

    let cycleQuery = '';
    const priorPlaceholders = priorNodes.map(() => '?').join(',');

    if (params.direction === 'upstream') {
      cycleQuery = `
        SELECT 1 FROM edges 
        WHERE type IN (${placeholders}) 
          AND (
            (type = 'depends_on' AND source_id = ? AND target_id IN (${priorPlaceholders})) OR
            (type = 'child_of' AND target_id = ? AND source_id IN (${priorPlaceholders})) OR
            (type = 'blocks' AND target_id = ? AND source_id IN (${priorPlaceholders}))
          )
        LIMIT 1
      `;
    } else {
      cycleQuery = `
        SELECT 1 FROM edges 
        WHERE type IN (${placeholders}) 
          AND (
            (type = 'depends_on' AND target_id = ? AND source_id IN (${priorPlaceholders})) OR
            (type = 'child_of' AND source_id = ? AND target_id IN (${priorPlaceholders})) OR
            (type = 'blocks' AND source_id = ? AND target_id IN (${priorPlaceholders}))
          )
        LIMIT 1
      `;
    }

    const cycleEdge = db.prepare(cycleQuery).get(
      ...allowedEdgeTypes,
      r.node_id,
      ...priorNodes,
      r.node_id,
      ...priorNodes,
      r.node_id,
      ...priorNodes
    );

    if (cycleEdge) {
      has_cycle = true;
      break;
    }
  }

  return { chain, has_cycle };
}

export function findBlockers(params: {
  project?: string;
  node_id?: string;
  include_transitive?: boolean;
}): BlockerSummary[] {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);
  const branch = getCurrentBranch() || '*';

  if (params.node_id) {
    const traceResult = traceDependencies({
      project: projectSlug,
      node_id: params.node_id,
      direction: 'upstream',
      edge_types: ['depends_on', 'blocks', 'child_of'],
      max_depth: 15,
    });

    const blockersInChain = traceResult.chain.filter(
      (item) => item.node.type === 'blocker' && item.node.status === 'active'
    );

    const targetRow = db.prepare('SELECT * FROM nodes WHERE id = ?').get(params.node_id) as NodeRow | undefined;
    if (!targetRow) {
      return [];
    }
    const targetNode = parseNodeRow(targetRow);

    const blockerSummaries: BlockerSummary[] = blockersInChain.map((item) => {
      return {
        blocker_node: item.node,
        blocked_nodes: [
          {
            node: targetNode,
            depth: item.depth,
          },
        ],
      };
    });

    return blockerSummaries;
  } else {
    let blockerSql = "SELECT * FROM nodes WHERE project = ? AND type = 'blocker' AND status = 'active'";
    const blockerArgs: any[] = [projectSlug];
    if (branch !== '*') {
      blockerSql += " AND git_branch = ?";
      blockerArgs.push(branch);
    }
    
    const blockerRows = db.prepare(blockerSql).all(...blockerArgs) as NodeRow[];

    const blockerSummaries: BlockerSummary[] = [];

    for (const row of blockerRows) {
      const blockerNode = parseNodeRow(row);

      const traceResult = traceDependencies({
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


export function getProjectSummary(params: { project?: string }): {
  node_counts: Record<string, number>;
  status_breakdown: Record<string, Record<string, number>>;
  active_blockers: BlockerSummary[];
  recent_decisions: BaseNode[];
  progress: {
    total_tasks: number;
    completed_tasks: number;
    pct: number;
  };
  recommended_next_tools?: string[];
} {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);
  const branch = getCurrentBranch() || '*';

  let countsSql = "SELECT type, COUNT(*) as count FROM nodes WHERE project = ?";
  let statusSql = "SELECT type, status, COUNT(*) as count FROM nodes WHERE project = ?";
  let recentDecisionsSql = "SELECT * FROM nodes WHERE project = ? AND type = 'decision'";
  let totalTasksSql = "SELECT COUNT(*) as count FROM nodes WHERE project = ? AND type = 'task' AND status != 'cancelled'";
  let completedTasksSql = "SELECT COUNT(*) as count FROM nodes WHERE project = ? AND type = 'task' AND status = 'done'";

  const args: any[] = [projectSlug];
  if (branch !== '*') {
    countsSql += " AND git_branch = ?";
    statusSql += " AND git_branch = ?";
    recentDecisionsSql += " AND git_branch = ?";
    totalTasksSql += " AND git_branch = ?";
    completedTasksSql += " AND git_branch = ?";
    args.push(branch);
  }

  countsSql += " GROUP BY type";
  statusSql += " GROUP BY type, status";
  recentDecisionsSql += " ORDER BY created_at DESC LIMIT 5";

  const countRows = db.prepare(countsSql).all(...args) as any[];
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

  const statusRows = db.prepare(statusSql).all(...args) as any[];
  const status_breakdown: Record<string, Record<string, number>> = {};
  for (const r of statusRows) {
    if (!status_breakdown[r.type]) {
      status_breakdown[r.type] = {};
    }
    status_breakdown[r.type][r.status] = r.count;
  }

  const active_blockers = findBlockers({ project: projectSlug });

  const decisionRows = db.prepare(recentDecisionsSql).all(...args) as NodeRow[];
  const recent_decisions = decisionRows.map(parseNodeRow);

  const total_tasks = db.prepare(totalTasksSql).get(...args) as any;
  const completed_tasks = db.prepare(completedTasksSql).get(...args) as any;

  const total = total_tasks ? total_tasks.count : 0;
  const completed = completed_tasks ? completed_tasks.count : 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const recommended_next_tools: string[] = [];
  if (active_blockers.length > 0) {
    recommended_next_tools.push('find_blockers', 'add_note');
  }
  if (node_counts.task > 0) {
    recommended_next_tools.push('complete_task', 'next_tasks');
  }
  if (node_counts.artifact > 0) {
    recommended_next_tools.push('validate_memory_references');
  }
  if (node_counts.visual_state > 0 || (node_counts.acceptance_criterion || 0) > 0) {
    recommended_next_tools.push('link_visual_state', 'verify_requirement');
  }

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
    recommended_next_tools,
  };
}

export function findSimilarBlockers(params: {
  project?: string;
  query: string;
  limit?: number;
}): BaseNode[] {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);
  const limit = params.limit !== undefined ? params.limit : 10;

  const rows = db
    .prepare(
      `SELECT * FROM nodes WHERE project = ? AND (type = 'observation' OR type = 'blocker')`
    )
    .all(projectSlug) as NodeRow[];

  const nodes = rows.map(parseNodeRow);
  return searchTfidf(nodes, params.query, limit);
}
