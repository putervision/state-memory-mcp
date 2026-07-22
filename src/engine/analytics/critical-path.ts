import { getDb, getProjectSlug } from '../db.js';
import { BaseNode, NodeRow, EdgeRow } from '../../schema/types.js';
import { parseNodeRow } from '../row-mappers.js';
import { traceDependencies } from './dependencies.js';

export function criticalPath(params: { project?: string; milestone_id: string }): {
  path: BaseNode[];
  total_estimate_hours: number;
} {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  const milestone = db
    .prepare("SELECT * FROM nodes WHERE id = ? AND type = 'milestone'")
    .get(params.milestone_id) as NodeRow | undefined;
  if (!milestone) {
    throw new Error(`Milestone node not found: ${params.milestone_id}`);
  }

  const trace = traceDependencies({
    project: projectSlug,
    node_id: params.milestone_id,
    direction: 'upstream',
    edge_types: ['depends_on', 'blocks', 'child_of'],
    max_depth: 20,
  });

  const activeNodes = trace.chain
    .map((item) => item.node)
    .filter(
      (node) =>
        node.status !== 'done' &&
        node.status !== 'cancelled' &&
        (node.type === 'task' || node.type === 'milestone')
    );

  const rootMilestoneNode = parseNodeRow(milestone);
  activeNodes.push(rootMilestoneNode);

  const activeNodeIds = activeNodes.map((n) => n.id);
  if (activeNodeIds.length <= 1) {
    return { path: activeNodes, total_estimate_hours: 0 };
  }

  let edgeRows: EdgeRow[] = [];
  const chunkSize = 400;
  for (let i = 0; i < activeNodeIds.length; i += chunkSize) {
    const chunk = activeNodeIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = db
      .prepare(
        `
      SELECT * FROM edges 
      WHERE project = ? 
        AND source_id IN (${placeholders}) 
        AND target_id IN (${placeholders})
    `
      )
      .all(projectSlug, ...chunk, ...chunk) as EdgeRow[];
    edgeRows.push(...rows);
  }

  const getWeight = (node: BaseNode): number => {
    const est = node.metadata.estimate;
    if (typeof est === 'number') return est;
    if (typeof est === 'string') {
      const match = est.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hours)?$/i);
      if (match) return parseFloat(match[1]);
    }
    return 1;
  };

  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of activeNodes) {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edgeRows) {
    let u = '';
    let v = '';
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

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const topoOrder: string[] = [];
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    topoOrder.push(u);
    const neighbors = adj.get(u) || [];
    for (const v of neighbors) {
      inDegree.set(v, inDegree.get(v)! - 1);
      if (inDegree.get(v) === 0) {
        queue.push(v);
      }
    }
  }

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

  const path: BaseNode[] = [];
  let currentId: string | undefined = params.milestone_id;
  const total_estimate_hours = dist.get(params.milestone_id) || 0;

  if (dist.has(params.milestone_id)) {
    while (currentId) {
      const node = nodesMap.get(currentId);
      if (node) path.unshift(node);
      currentId = parent.get(currentId);
    }
  }

  return { path, total_estimate_hours };
}
