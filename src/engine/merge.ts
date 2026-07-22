import Database from 'better-sqlite3';
import * as fs from 'fs';
import { NodeRow, EdgeRow } from '../schema/types.js';
import { getDb, getProjectSlug, resolveProjectRoot } from './db.js';
import { parseNodeRow, parseEdgeRow } from './row-mappers.js';
import { findCycles } from './audit.js';
import { validatePath, loadPathConfig } from '../utils/path-validator.js';

export interface MergeReport {
  project: string;
  nodes_added: number;
  nodes_updated: number;
  nodes_skipped: number;
  edges_added: number;
  edges_skipped: number;
  cycles_detected: string[][];
  transaction_rolled_back: boolean;
  warnings: string[];
}

/**
 * Merge source database into target project database
 */
export function mergeProjectDb(params: {
  sourcePath: string;
  project?: string;
  force?: boolean;
}): MergeReport {
  const projectSlug = getProjectSlug(params.project);
  const projectRoot = resolveProjectRoot(params.project);
  const pathConfig = loadPathConfig(projectRoot);
  const resolvedSourcePath = validatePath(params.sourcePath, { ...pathConfig, mustExist: true });

  if (!fs.existsSync(resolvedSourcePath)) {
    throw new Error(`Source database file not found: ${resolvedSourcePath}`);
  }

  // 1. Verify structural soundness of source DB and read data
  let sourceNodes: NodeRow[];
  let sourceEdges: EdgeRow[];
  let sourceDb: Database.Database | undefined;

  try {
    sourceDb = new Database(resolvedSourcePath, { readonly: true });
    const check = sourceDb.pragma('integrity_check') as any[];
    const isOk =
      Array.isArray(check) &&
      check.length === 1 &&
      (check[0] === 'ok' || check[0]?.integrity_check === 'ok');
    if (!isOk) {
      throw new Error(`Source database integrity check failed: ${JSON.stringify(check)}`);
    }

    // Check tables exist
    const tables = sourceDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('nodes', 'edges')")
      .all();
    if (tables.length < 2) {
      throw new Error("Invalid source database: 'nodes' and 'edges' tables must exist.");
    }

    sourceNodes = sourceDb.prepare('SELECT * FROM nodes').all() as NodeRow[];
    sourceEdges = sourceDb.prepare('SELECT * FROM edges').all() as EdgeRow[];
  } catch (err: any) {
    throw new Error(`Invalid source sqlite database file: ${err.message}`);
  } finally {
    if (sourceDb) {
      try {
        sourceDb.close();
      } catch {
        // Ignore close error on cleanup
      }
    }
  }

  const targetDb = getDb(params.project);

  const report: MergeReport = {
    project: projectSlug,
    nodes_added: 0,
    nodes_updated: 0,
    nodes_skipped: 0,
    edges_added: 0,
    edges_skipped: 0,
    cycles_detected: [],
    transaction_rolled_back: false,
    warnings: [],
  };

  try {
    targetDb.transaction(() => {
      // 1. Process Nodes
      for (const node of sourceNodes) {
        const existing = targetDb
          .prepare('SELECT updated_at FROM nodes WHERE id = ?')
          .get(node.id) as { updated_at: string } | undefined;
        if (!existing) {
          targetDb
            .prepare(
              `
            INSERT INTO nodes (id, type, title, status, project, git_branch, metadata, tags, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
            )
            .run(
              node.id,
              node.type,
              node.title,
              node.status,
              projectSlug,
              node.git_branch,
              node.metadata,
              node.tags,
              node.created_at,
              node.updated_at
            );
          report.nodes_added++;
        } else {
          // Parse guard to verify valid ISO 8601 format and compare timestamps
          const nodeTime = Date.parse(node.updated_at);
          const existingTime = Date.parse(existing.updated_at);
          const isNodeTimeValid = !isNaN(nodeTime);
          const isExistingTimeValid = !isNaN(existingTime);

          if (isNodeTimeValid && isExistingTimeValid && nodeTime > existingTime) {
            targetDb
              .prepare(
                `
              UPDATE nodes
              SET type = ?, title = ?, status = ?, project = ?, git_branch = ?, metadata = ?, tags = ?, created_at = ?, updated_at = ?
              WHERE id = ?
            `
              )
              .run(
                node.type,
                node.title,
                node.status,
                projectSlug,
                node.git_branch,
                node.metadata,
                node.tags,
                node.created_at,
                node.updated_at,
                node.id
              );
            report.nodes_updated++;
          } else {
            report.nodes_skipped++;
          }
        }
      }

      // Fetch all node IDs currently in target DB (existing + newly inserted/updated)
      const allNodeIds = new Set(
        (
          targetDb.prepare('SELECT id FROM nodes WHERE project = ?').all(projectSlug) as {
            id: string;
          }[]
        ).map((row) => row.id)
      );

      // 2. Process Edges
      for (const edge of sourceEdges) {
        // Skip edges pointing to non-existent nodes
        if (!allNodeIds.has(edge.source_id) || !allNodeIds.has(edge.target_id)) {
          report.warnings.push(
            `Skipped edge ${edge.id} (${edge.type}) because source (${edge.source_id}) or target (${edge.target_id}) node is missing.`
          );
          report.edges_skipped++;
          continue;
        }

        const existingEdge = targetDb
          .prepare(
            `
          SELECT 1 FROM edges WHERE source_id = ? AND target_id = ? AND type = ?
        `
          )
          .get(edge.source_id, edge.target_id, edge.type);

        if (!existingEdge) {
          // Use INSERT OR IGNORE to handle ID collisions gracefully if the ID already exists in the database
          targetDb
            .prepare(
              `
            INSERT OR IGNORE INTO edges (id, source_id, target_id, type, properties, project, git_branch, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `
            )
            .run(
              edge.id,
              edge.source_id,
              edge.target_id,
              edge.type,
              edge.properties,
              projectSlug,
              edge.git_branch,
              edge.created_at
            );
          report.edges_added++;
        } else {
          report.edges_skipped++;
        }
      }

      // 3. Cycle Validation
      const currentNodes = targetDb
        .prepare('SELECT * FROM nodes WHERE project = ?')
        .all(projectSlug) as NodeRow[];
      const currentEdges = targetDb
        .prepare('SELECT * FROM edges WHERE project = ?')
        .all(projectSlug) as EdgeRow[];

      const parsedNodes = currentNodes.map(parseNodeRow);
      const parsedEdges = currentEdges.map(parseEdgeRow);

      const cycles = findCycles(parsedNodes, parsedEdges);
      if (cycles.length > 0) {
        report.cycles_detected = cycles;
        if (!params.force) {
          throw new Error('Merge introduces circular dependencies.');
        } else {
          report.warnings.push(
            `Merge succeeded but introduced ${cycles.length} circular dependencies.`
          );
        }
      }
    })();
  } catch (error: any) {
    report.transaction_rolled_back = true;
    report.warnings.push(`Merge failed and was rolled back: ${error.message}`);
  }

  return report;
}
