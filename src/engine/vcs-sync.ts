import { getDb, getProjectSlug } from './db.js';
import { getCurrentBranch } from '../utils/git.js';
import { BaseNode } from '../schema/types.js';
import { parseNodeRow } from './row-mappers.js';

export interface VCSBranchSyncResult {
  current_branch: string;
  target_branch: string;
  branch_nodes_count: number;
  diverted_decisions: BaseNode[];
  unmerged_tasks: BaseNode[];
}

export function vcsBranchSync(params: {
  project?: string;
  target_branch?: string;
}): VCSBranchSyncResult {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);
  const currentBranch = getCurrentBranch();
  const targetBranch = params.target_branch || 'main';

  const branchNodesRaw = db
    .prepare('SELECT * FROM nodes WHERE project = ? AND git_branch = ?')
    .all(projectSlug, currentBranch) as any[];

  const branchNodes = branchNodesRaw.map(parseNodeRow);

  const divertedDecisions = branchNodes.filter((n) => n.type === 'decision');
  const unmergedTasks = branchNodes.filter((n) => n.type === 'task' && n.status !== 'done');

  return {
    current_branch: currentBranch || 'main',
    target_branch: targetBranch,
    branch_nodes_count: branchNodes.length,
    diverted_decisions: divertedDecisions,
    unmerged_tasks: unmergedTasks,
  };
}

export interface VCSMergeConflict {
  node_id: string;
  title: string;
  source_status: string;
  target_status: string;
}

export interface VCSMergeResult {
  source_branch: string;
  target_branch: string;
  merged_nodes_count: number;
  conflict_count: number;
  conflicts: VCSMergeConflict[];
}

export function vcsMergeResolution(params: {
  project?: string;
  source_branch: string;
  target_branch: string;
  strategy?: 'auto_accept' | 'flag_conflicts';
}): VCSMergeResult {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);
  const strategy = params.strategy || 'flag_conflicts';

  const sourceNodes = db
    .prepare('SELECT * FROM nodes WHERE project = ? AND git_branch = ?')
    .all(projectSlug, params.source_branch) as any[];

  const targetNodes = db
    .prepare('SELECT * FROM nodes WHERE project = ? AND git_branch = ?')
    .all(projectSlug, params.target_branch) as any[];

  const targetNodeMap = new Map<string, any>();
  for (const tn of targetNodes) {
    targetNodeMap.set(tn.id, tn);
    targetNodeMap.set(tn.title, tn);
  }

  let mergedCount = 0;
  const conflicts: VCSMergeConflict[] = [];

  for (const sn of sourceNodes) {
    const tn = targetNodeMap.get(sn.id) || targetNodeMap.get(sn.title);
    if (tn) {
      if (tn.status !== sn.status || tn.title !== sn.title) {
        conflicts.push({
          node_id: sn.id,
          title: sn.title,
          source_status: sn.status,
          target_status: tn.status,
        });
      }
    } else {
      mergedCount++;
      if (strategy === 'auto_accept') {
        db.prepare('UPDATE nodes SET git_branch = ? WHERE id = ?').run(params.target_branch, sn.id);
      }
    }
  }

  return {
    source_branch: params.source_branch,
    target_branch: params.target_branch,
    merged_nodes_count: mergedCount,
    conflict_count: conflicts.length,
    conflicts,
  };
}
