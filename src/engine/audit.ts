import Database from 'better-sqlite3';
import { getDb, getProjectSlug, resolveProjectRoot } from './db.js';
import { BaseNode, Edge, NodeRow, EdgeRow } from '../schema/types.js';
import { parseNodeRow, parseEdgeRow } from './row-mappers.js';
import { AnalyticsEngine } from './analytics.js';
import { findSubdirectoryMemoryDbs, SubdirectoryMemoryDb } from './subdirectory-scanner.js';

export interface AuditReport {
  project: string;
  sqlite_integrity: string[];
  foreign_key_violations: any[];
  orphaned_edges_count: number;
  orphaned_edges: { id: string; source_id: string; target_id: string; type: string }[];
  cycles: string[][];
  contradictions: {
    blocked_done_tasks: { task: BaseNode; blocker: BaseNode }[];
    contradicting_decisions: { decision1: BaseNode; decision2: BaseNode }[];
  };
  node_count: number;
  edge_count: number;
  subdirectory_databases_audited?: number;
  warnings: string[];
}

/**
 * In-memory cycle detection for dependency-like edges (depends_on, blocks, child_of)
 */
export function findCycles(nodes: BaseNode[], edges: Edge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    adj.set(n.id, []);
  }
  for (const e of edges) {
    if (e.type === 'depends_on' || e.type === 'child_of') {
      if (adj.has(e.source_id)) {
        adj.get(e.source_id)!.push(e.target_id);
      }
    } else if (e.type === 'blocks') {
      if (adj.has(e.target_id)) {
        adj.get(e.target_id)!.push(e.source_id);
      }
    }
  }

  const visited = new Map<string, 'white' | 'gray' | 'black'>();
  for (const n of nodes) {
    visited.set(n.id, 'white');
  }

  const cycles: string[][] = [];
  const parent = new Map<string, string>();

  function dfs(u: string) {
    visited.set(u, 'gray');
    const neighbors = adj.get(u) || [];
    for (const v of neighbors) {
      if (visited.get(v) === 'gray') {
        const cycle = [v];
        let curr = u;
        while (curr !== v && curr) {
          cycle.push(curr);
          curr = parent.get(curr)!;
        }
        cycle.push(v);
        cycles.push(cycle.reverse());
      } else if (visited.get(v) === 'white') {
        parent.set(v, u);
        dfs(v);
      }
    }
    visited.set(u, 'black');
  }

  for (const n of nodes) {
    if (visited.get(n.id) === 'white') {
      dfs(n.id);
    }
  }

  return cycles;
}

/**
 * Audit project database for integrity and logical problems
 */
export async function auditProjectDb(params: {
  project?: string;
  includeSubdirectories?: boolean;
}): Promise<AuditReport> {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  const report: AuditReport = {
    project: projectSlug,
    sqlite_integrity: [],
    foreign_key_violations: [],
    orphaned_edges_count: 0,
    orphaned_edges: [],
    cycles: [],
    contradictions: {
      blocked_done_tasks: [],
      contradicting_decisions: [],
    },
    node_count: 0,
    edge_count: 0,
    subdirectory_databases_audited: 0,
    warnings: [],
  };

  // 1. SQLite Integrity check
  const integrity = db.pragma('integrity_check') as any[];
  const integrityStrings = integrity.map((row) =>
    typeof row === 'string' ? row : row?.integrity_check
  );
  report.sqlite_integrity = integrityStrings;
  if (!integrityStrings.includes('ok')) {
    report.warnings.push('Physical database integrity check failed.');
  }

  // 2. SQLite Foreign Key check
  const fkViolations = db.pragma('foreign_key_check') as any[];
  report.foreign_key_violations = fkViolations;
  if (fkViolations.length > 0) {
    report.warnings.push(`Detected ${fkViolations.length} foreign key violations.`);
  }

  // Fetch nodes and edges
  const nodeRows = db
    .prepare('SELECT * FROM nodes WHERE project = ?')
    .all(projectSlug) as NodeRow[];
  const edgeRows = db
    .prepare('SELECT * FROM edges WHERE project = ?')
    .all(projectSlug) as EdgeRow[];

  report.node_count = nodeRows.length;
  report.edge_count = edgeRows.length;

  const nodes = nodeRows.map(parseNodeRow);
  const edges = edgeRows.map(parseEdgeRow);

  const nodeIds = new Set(nodes.map((n) => n.id));

  // 3. Orphaned Edges check (referential integrity)
  const orphaned = edges.filter((e) => !nodeIds.has(e.source_id) || !nodeIds.has(e.target_id));
  report.orphaned_edges_count = orphaned.length;
  report.orphaned_edges = orphaned.map((e) => ({
    id: e.id,
    source_id: e.source_id,
    target_id: e.target_id,
    type: e.type,
  }));

  if (orphaned.length > 0) {
    report.warnings.push(`Detected ${orphaned.length} orphaned edges referencing missing nodes.`);
  }

  // 4. Cycle Detection
  const cycles = findCycles(nodes, edges);
  report.cycles = cycles;
  if (cycles.length > 0) {
    report.warnings.push(`Detected ${cycles.length} circular dependencies.`);
  }

  // 5. Logical Contradictions check (delegate to AnalyticsEngine)
  const contradictions = AnalyticsEngine.detectContradictions({ project: projectSlug });
  report.contradictions = contradictions;

  const totalContradictions =
    report.contradictions.blocked_done_tasks.length +
    report.contradictions.contradicting_decisions.length;
  if (totalContradictions > 0) {
    report.warnings.push(`Detected ${totalContradictions} logical contradictions.`);
  }

  // 6. Subdirectory Databases Audit
  if (params.includeSubdirectories) {
    try {
      const projectRoot = resolveProjectRoot(params.project);
      const subDbs = await findSubdirectoryMemoryDbs(projectRoot);
      report.subdirectory_databases_audited = subDbs.length;

      for (const subDb of subDbs) {
        try {
          const subConn = new Database(subDb.dbPath, { readonly: true });
          const subIntegrity = subConn.pragma('integrity_check') as any[];
          const subIntegrityStrings = subIntegrity.map((row) =>
            typeof row === 'string' ? row : row?.integrity_check
          );
          if (!subIntegrityStrings.includes('ok')) {
            report.warnings.push(
              `Physical database integrity check failed for sub-directory DB at "${subDb.relPath}".`
            );
          }

          const subNodeRows = subConn.prepare('SELECT * FROM nodes').all() as NodeRow[];
          const subEdgeRows = subConn.prepare('SELECT * FROM edges').all() as EdgeRow[];
          const subNodes = subNodeRows.map(parseNodeRow);
          const subEdges = subEdgeRows.map(parseEdgeRow);
          const subCycles = findCycles(subNodes, subEdges);

          if (subCycles.length > 0) {
            report.warnings.push(
              `Detected ${subCycles.length} circular dependencies in sub-directory DB at "${subDb.relPath}".`
            );
          }
          subConn.close();
        } catch (err: any) {
          report.warnings.push(
            `Failed to audit sub-directory database at "${subDb.relPath}": ${err.message}`
          );
        }
      }
    } catch {}
  }

  return report;
}
