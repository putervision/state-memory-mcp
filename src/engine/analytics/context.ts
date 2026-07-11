import { getDb, getProjectSlug } from '../db.js';
import { BaseNode, NodeRow } from '../../schema/types.js';
import { getCurrentBranch } from '../../utils/git.js';
import { parseNodeRow } from '../row-mappers.js';
import { BlockerSummary, getProjectSummary, traceDependencies } from './dependencies.js';

export function getContextSnapshot(params: { project?: string }): {
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
  const summary = getProjectSummary({ project: projectSlug });

  const branch = getCurrentBranch() || '*';
  let taskSql = "SELECT * FROM nodes WHERE project = ? AND type = 'task' AND status = 'pending'";
  const taskArgs: any[] = [projectSlug];
  if (branch !== '*') {
    taskSql += " AND git_branch = ?";
    taskArgs.push(branch);
  }
  taskSql += " LIMIT 10";

  const taskRows = db.prepare(taskSql).all(...taskArgs) as NodeRow[];
  const pending_tasks = taskRows.map(parseNodeRow);

  let md = `## 📊 State Graph Context Snapshot [Project: ${projectSlug}]\n\n`;
  md += `### Task Progress\n`;
  const total = summary.progress.total_tasks;
  const completed = summary.progress.completed_tasks;
  const pct = summary.progress.pct;

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

export function findRelatedDecisions(params: { project?: string; artifact_id: string }): BaseNode[] {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

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

export function findBlockedTasks(params: { project?: string; decision_id: string }): BaseNode[] {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  const decExists = db
    .prepare("SELECT 1 FROM nodes WHERE id = ? AND type = 'decision'")
    .get(params.decision_id);
  if (!decExists) {
    throw new Error(`Decision node not found: ${params.decision_id}`);
  }

  const trace = traceDependencies({
    project: projectSlug,
    node_id: params.decision_id,
    direction: 'downstream',
    edge_types: ['depends_on', 'blocks', 'child_of', 'decided_in', 'part_of', 'implements'],
    max_depth: 20,
  });

  return trace.chain.map((item) => item.node).filter((node) => node.type === 'task');
}
