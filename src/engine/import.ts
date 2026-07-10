import { getDb, getProjectSlug } from './db.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { logger } from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';

/**
 * Bulk import nodes and edges.
 * Wraps imports in a database transaction.
 */
export function importGraph(params: {
  project?: string;
  nodes: any[];
  edges: any[];
  force?: boolean;
}): { imported_nodes_count: number; imported_edges_count: number } {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  // Check if nodes or edges exist for this project
  const existingNode = db.prepare('SELECT 1 FROM nodes WHERE project = ? LIMIT 1').get(projectSlug);
  const existingEdge = db.prepare('SELECT 1 FROM edges WHERE project = ? LIMIT 1').get(projectSlug);

  if ((existingNode || existingEdge) && !params.force) {
    throw new ValidationError(
      'Database is not empty. Bulk importing will overwrite existing data. Pass force: true to proceed.'
    );
  }

  db.transaction(() => {
    // 1. Clear existing nodes and edges for this project
    db.prepare('DELETE FROM edges WHERE project = ?').run(projectSlug);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(projectSlug);

    // 2. Insert nodes
    const nodeStmt = db.prepare(`
      INSERT INTO nodes (id, type, title, status, project, git_branch, metadata, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const n of params.nodes) {
      const id = n.id || generateId();
      const now = getCurrentIsoString();
      const metadata =
        typeof n.metadata === 'string' ? n.metadata : JSON.stringify(n.metadata || {});
      const tags = typeof n.tags === 'string' ? n.tags : JSON.stringify(n.tags || []);
      const branch = n.git_branch || 'main';

      nodeStmt.run(
        id,
        n.type || 'task',
        n.title || 'Untitled Node',
        n.status || 'pending',
        projectSlug,
        branch,
        metadata,
        tags,
        n.created_at || now,
        n.updated_at || now
      );
    }

    // 3. Insert edges
    const edgeStmt = db.prepare(`
      INSERT INTO edges (id, source_id, target_id, type, properties, project, git_branch, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const e of params.edges) {
      const id = e.id || generateId();
      const now = getCurrentIsoString();
      const properties =
        typeof e.properties === 'string' ? e.properties : JSON.stringify(e.properties || {});
      const branch = e.git_branch || 'main';

      edgeStmt.run(
        id,
        e.source_id,
        e.target_id,
        e.type,
        properties,
        projectSlug,
        branch,
        e.created_at || now
      );
    }
  })();

  logger.info(
    `Imported ${params.nodes.length} nodes and ${params.edges.length} edges for project ${projectSlug}`
  );

  return {
    imported_nodes_count: params.nodes.length,
    imported_edges_count: params.edges.length,
  };
}
