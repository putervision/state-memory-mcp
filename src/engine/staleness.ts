import Database from 'better-sqlite3';
import { parseNodeRow } from './row-mappers.js';
import { BaseNode } from '../schema/types.js';
import { getCurrentBranch } from '../utils/git.js';

export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)\s*(d|h|m|s|w|y|days|hours|minutes|seconds|weeks|years)?$/i);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }
  const val = parseInt(match[1], 10);
  const unit = (match[2] || 'd').toLowerCase();

  switch (unit) {
    case 's':
    case 'seconds':
      return val * 1000;
    case 'm':
    case 'minutes':
      return val * 60 * 1000;
    case 'h':
    case 'hours':
      return val * 60 * 60 * 1000;
    case 'd':
    case 'days':
      return val * 24 * 60 * 60 * 1000;
    case 'w':
    case 'weeks':
      return val * 7 * 24 * 60 * 60 * 1000;
    case 'y':
    case 'years':
      return val * 365 * 24 * 60 * 60 * 1000;
    default:
      return val * 24 * 60 * 60 * 1000;
  }
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''}`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  return `${seconds} second${seconds > 1 ? 's' : ''}`;
}

export function getStaleNodes(
  db: Database.Database,
  params: {
    project: string;
    older_than?: string;
    status?: string;
    type?: string;
    git_branch?: string;
    limit?: number;
  }
): { nodes: (BaseNode & { idle_duration: string })[]; count: number } {
  const branch = params.git_branch !== undefined ? params.git_branch : getCurrentBranch() || '*';
  const limit = params.limit !== undefined ? params.limit : 20;
  const statusFilter = params.status !== undefined ? params.status : 'in_progress';
  const olderThanStr = params.older_than !== undefined ? params.older_than : '7d';

  const idleMs = parseDuration(olderThanStr);
  const thresholdTime = new Date(Date.now() - idleMs).toISOString();

  let sql = 'SELECT * FROM nodes WHERE project = ? AND updated_at < ?';
  const args: any[] = [params.project, thresholdTime];

  if (branch !== '*') {
    sql += ' AND git_branch = ?';
    args.push(branch);
  }
  if (statusFilter !== '*') {
    sql += ' AND status = ?';
    args.push(statusFilter);
  }
  if (params.type) {
    sql += ' AND type = ?';
    args.push(params.type);
  }

  const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
  const countRow = db.prepare(countSql).get(...args) as any;
  const total_count = countRow ? countRow.total : 0;

  sql += ' ORDER BY updated_at ASC LIMIT ?';
  args.push(limit);

  const rows = db.prepare(sql).all(...args) as any[];
  const now = Date.now();

  const nodes = rows.map((row) => {
    const node = parseNodeRow(row);
    const updatedTime = new Date(node.updated_at || node.created_at).getTime();
    const idleMsActual = now - updatedTime;
    return {
      ...node,
      idle_duration: formatDuration(idleMsActual),
    };
  });

  return {
    nodes,
    count: total_count,
  };
}

export function autoPruneStaleTasks(
  db: Database.Database,
  params: {
    project: string;
    older_than?: string;
    target_status?: string;
  }
): { pruned_count: number; updated_node_ids: string[] } {
  const targetStatus = params.target_status || 'cancelled';
  const staleInfo = getStaleNodes(db, {
    project: params.project,
    older_than: params.older_than || '7d',
    status: 'in_progress',
    limit: 100,
  });

  const updatedIds: string[] = [];

  if (staleInfo.nodes.length > 0) {
    const nowStr = new Date().toISOString();
    for (const staleNode of staleInfo.nodes) {
      const metaStr = JSON.stringify({
        ...staleNode.metadata,
        auto_pruned: true,
        pruned_at: nowStr,
        pruned_reason: `Task idle for ${staleNode.idle_duration}`,
      });
      db.prepare('UPDATE nodes SET status = ?, metadata = ?, updated_at = ? WHERE id = ?').run(
        targetStatus,
        metaStr,
        nowStr,
        staleNode.id
      );
      updatedIds.push(staleNode.id);
    }
  }

  return {
    pruned_count: updatedIds.length,
    updated_node_ids: updatedIds,
  };
}
