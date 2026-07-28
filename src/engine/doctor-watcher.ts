import fs from 'fs';
import { getDb, getProjectSlug, getDbPath, getMetaValue } from './db.js';
import { EventEngine, EventRecord } from './events.js';

export interface DoctorReportResult {
  status: 'healthy' | 'warning' | 'degraded';
  schema_version: number;
  db_size_bytes: number;
  total_nodes: number;
  total_edges: number;
  orphan_edges_count: number;
  stale_nodes_count: number;
  issues: string[];
  recommendations: string[];
}

export function getDoctorReport(params: { project?: string }): DoctorReportResult {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);
  const dbPath = getDbPath(projectSlug);

  const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
  const versionStr = getMetaValue(db, 'version') || '1';
  const schemaVersion = parseInt(versionStr, 10);

  const totalNodes = (
    db.prepare('SELECT COUNT(*) as count FROM nodes WHERE project = ?').get(projectSlug) as any
  ).count;

  const totalEdges = (
    db.prepare('SELECT COUNT(*) as count FROM edges WHERE project = ?').get(projectSlug) as any
  ).count;

  const orphanEdges = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM edges WHERE project = ? AND (
          source_id NOT IN (SELECT id FROM nodes WHERE project = ?) OR
          target_id NOT IN (SELECT id FROM nodes WHERE project = ?)
        )`
      )
      .get(projectSlug, projectSlug, projectSlug) as any
  ).count;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const staleNodes = (
    db
      .prepare(
        "SELECT COUNT(*) as count FROM nodes WHERE project = ? AND type = 'task' AND status = 'in_progress' AND updated_at < ?"
      )
      .get(projectSlug, sevenDaysAgo) as any
  ).count;

  const issues: string[] = [];
  const recommendations: string[] = [];

  if (orphanEdges > 0) {
    issues.push(`Detected ${orphanEdges} orphaned edges referencing missing nodes.`);
    recommendations.push('Run compact_graph tool with prune_orphaned_edges: true.');
  }

  if (staleNodes > 0) {
    issues.push(`Detected ${staleNodes} stale tasks in_progress without updates for > 7 days.`);
    recommendations.push('Review stale tasks with get_stale_nodes or update their status.');
  }

  let status: 'healthy' | 'warning' | 'degraded' = 'healthy';
  if (issues.length > 0) {
    status = orphanEdges > 5 ? 'degraded' : 'warning';
  }

  return {
    status,
    schema_version: schemaVersion,
    db_size_bytes: dbSize,
    total_nodes: totalNodes,
    total_edges: totalEdges,
    orphan_edges_count: orphanEdges,
    stale_nodes_count: staleNodes,
    issues,
    recommendations,
  };
}

export function watchGraphChanges(params: {
  project?: string;
  since_timestamp?: string;
  session_id?: string;
}): { changed_events_count: number; events: EventRecord[] } {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  const events = EventEngine.getEventLog(db, {
    project: projectSlug,
    session_id: params.session_id,
    since: params.since_timestamp,
    limit: 200,
  });

  return {
    changed_events_count: events.length,
    events,
  };
}
