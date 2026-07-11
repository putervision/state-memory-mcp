import Database from 'better-sqlite3';
import { parseNodeRow, parseEdgeRow } from './row-mappers.js';
import { BaseNode } from '../schema/types.js';
import { getCurrentBranch } from '../utils/git.js';

export interface NextTask {
  node: BaseNode;
  priority_reason: string;
  blocked_by: string[];
  blocks: string[];
}

export function getNextTasks(
  db: Database.Database,
  params: {
    project: string;
    git_branch?: string;
    limit?: number;
    include_context?: boolean;
  }
): { tasks: NextTask[]; summary: string } {
  const branch = params.git_branch !== undefined ? params.git_branch : getCurrentBranch() || '*';
  const limit = params.limit !== undefined ? params.limit : 5;

  // 1. Fetch all nodes in the project
  let nodesSql = 'SELECT * FROM nodes WHERE project = ?';
  const nodesArgs: any[] = [params.project];
  if (branch !== '*') {
    nodesSql += ' AND git_branch = ?';
    nodesArgs.push(branch);
  }
  const nodeRows = db.prepare(nodesSql).all(...nodesArgs) as any[];
  const allNodes = nodeRows.map(parseNodeRow);

  // Map of all nodes by ID for O(1) status lookup
  const nodesMap = new Map<string, BaseNode>();
  for (const node of allNodes) {
    nodesMap.set(node.id, node);
  }

  // 2. Fetch all edges in the project
  const edgeRows = db.prepare('SELECT * FROM edges WHERE project = ?').all(params.project) as any[];
  const allEdges = edgeRows.map(parseEdgeRow);

  // Build dependency maps
  const blockedBy = new Map<string, Set<string>>();
  const blocks = new Map<string, Set<string>>();

  for (const node of allNodes) {
    blockedBy.set(node.id, new Set());
    blocks.set(node.id, new Set());
  }

  for (const edge of allEdges) {
    let u = ''; // blocker / predecessor
    let v = ''; // blocked / successor

    if (edge.type === 'depends_on') {
      u = edge.target_id;
      v = edge.source_id;
    } else if (edge.type === 'blocks') {
      u = edge.source_id;
      v = edge.target_id;
    }

    if (u && v && nodesMap.has(u) && nodesMap.has(v)) {
      const blockerNode = nodesMap.get(u)!;
      if (blockerNode.status !== 'done' && blockerNode.status !== 'cancelled') {
        blockedBy.get(v)!.add(u);
      }

      const blockedNode = nodesMap.get(v)!;
      if (blockedNode.status !== 'done' && blockedNode.status !== 'cancelled') {
        blocks.get(u)!.add(v);
      }
    }
  }

  // 3. Filter pending and in_progress tasks
  const candidateTasks = allNodes.filter(
    (n) => n.type === 'task' && (n.status === 'pending' || n.status === 'in_progress')
  );

  const nextTasksList: NextTask[] = [];

  for (const task of candidateTasks) {
    const blockersList = Array.from(blockedBy.get(task.id) || []);
    const blocksList = Array.from(blocks.get(task.id) || []);

    let priorityReason = 'leaf dependency';
    if (blocksList.length > 0) {
      priorityReason = `blocking ${blocksList.length} downstream tasks`;
    } else if (blockersList.length === 0) {
      priorityReason = 'unblocked';
    }

    nextTasksList.push({
      node: task,
      priority_reason: priorityReason,
      blocked_by: blockersList,
      blocks: blocksList,
    });
  }

  // Filter to only UNBLOCKED tasks (no active blockers)
  const unblockedTasks = nextTasksList.filter((t) => t.blocked_by.length === 0);

  // Sort by:
  // 1. Tasks blocking the most others first
  // 2. Oldest created first
  unblockedTasks.sort((a, b) => {
    if (b.blocks.length !== a.blocks.length) {
      return b.blocks.length - a.blocks.length;
    }
    const timeA = new Date(a.node.created_at || 0).getTime();
    const timeB = new Date(b.node.created_at || 0).getTime();
    return timeA - timeB;
  });

  const paginatedTasks = unblockedTasks.slice(0, limit);

  const totalUnblocked = unblockedTasks.length;
  const blockingOthers = unblockedTasks.filter((t) => t.blocks.length > 0).length;
  const summary = `${totalUnblocked} unblocked tasks, ${blockingOthers} blocking others.`;

  return {
    tasks: paginatedTasks,
    summary,
  };
}
