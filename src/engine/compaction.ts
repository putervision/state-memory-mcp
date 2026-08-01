import fs from 'fs';
import { getDb, getProjectSlug, getDbPath } from './db.js';

export interface ArchiveNodesResult {
  archived_nodes_count: number;
  node_ids: string[];
}

export function archiveCompletedNodes(params: {
  project?: string;
  older_than_days?: number;
}): ArchiveNodesResult {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);
  const olderThanDays = params.older_than_days || 30;

  const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

  const eligibleNodes = db
    .prepare(
      "SELECT id FROM nodes WHERE project = ? AND type = 'task' AND status = 'done' AND updated_at < ?"
    )
    .all(projectSlug, cutoffDate) as { id: string }[];

  const archivedIds = eligibleNodes.map((n) => n.id);
  if (archivedIds.length > 0) {
    db.prepare(
      "UPDATE nodes SET metadata = json_set(metadata, '$.archived', 1) WHERE project = ? AND type = 'task' AND status = 'done' AND updated_at < ?"
    ).run(projectSlug, cutoffDate);
  }

  return {
    archived_nodes_count: archivedIds.length,
    node_ids: archivedIds,
  };
}

export interface CompactGraphResult {
  database_bytes_before: number;
  database_bytes_after: number;
  space_reclaimed_bytes: number;
  pruned_edges_count: number;
}

export function compactGraph(params: {
  project?: string;
  prune_orphaned_edges?: boolean;
}): CompactGraphResult {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);
  const dbPath = getDbPath(projectSlug);

  const bytesBefore = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

  let prunedEdges = 0;
  if (params.prune_orphaned_edges) {
    const res = db
      .prepare(
        `DELETE FROM edges WHERE project = ? AND (
          source_id NOT IN (SELECT id FROM nodes WHERE project = ?) OR
          target_id NOT IN (SELECT id FROM nodes WHERE project = ?)
        )`
      )
      .run(projectSlug, projectSlug, projectSlug);
    prunedEdges = res.changes;
  }

  // Optimize FTS and run VACUUM
  try {
    db.prepare("INSERT INTO nodes_fts(nodes_fts) VALUES('optimize')").run();
  } catch {
    // ignore if FTS missing or busy
  }

  db.exec('VACUUM;');

  const bytesAfter = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
  const reclaimed = Math.max(0, bytesBefore - bytesAfter);

  return {
    database_bytes_before: bytesBefore,
    database_bytes_after: bytesAfter,
    space_reclaimed_bytes: reclaimed,
    pruned_edges_count: prunedEdges,
  };
}
