import { getDb, getProjectSlug, resolveProjectRoot } from './db.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { logger } from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';
import { AddNodeSchema, AddEdgeSchema } from '../schema/schemas.js';
import { validatePath, loadPathConfig } from '../utils/path-validator.js';
import * as fs from 'fs';

/**
 * Bulk import nodes and edges.
 * Wraps imports in a database transaction.
 */
export function importGraph(params: {
  project?: string;
  nodes?: any[];
  edges?: any[];
  filePath?: string;
  fileSizeLimitBytes?: number;
  conflictStrategy?: 'skip' | 'overwrite' | 'generate_new';
  force?: boolean;
}): { imported_nodes_count: number; imported_edges_count: number } {
  const projectSlug = getProjectSlug(params.project);
  let nodes = params.nodes || [];
  let edges = params.edges || [];

  // 1. Resolve and validate filePath if provided
  if (params.filePath) {
    const projectRoot = resolveProjectRoot(params.project);
    const pathConfig = loadPathConfig(projectRoot);
    const validatedPath = validatePath(params.filePath, { ...pathConfig, mustExist: true });

    // Check file size
    const stat = fs.statSync(validatedPath);
    const limit = params.fileSizeLimitBytes ?? 50 * 1024 * 1024; // Default 50MB
    if (stat.size > limit) {
      throw new ValidationError(
        `Import file size (${stat.size} bytes) exceeds limit (${limit} bytes)`
      );
    }

    try {
      const raw = fs.readFileSync(validatedPath, 'utf-8');
      const data = JSON.parse(raw);
      if (data) {
        if (Array.isArray(data.nodes)) nodes = data.nodes;
        if (Array.isArray(data.edges)) edges = data.edges;
      }
    } catch (err: any) {
      throw new ValidationError(`Failed to read or parse import file: ${err.message}`);
    }
  }

  // 2. Validate all nodes against AddNodeSchema before insertion
  const validatedNodes: any[] = [];
  const importedNodeIds = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const result = AddNodeSchema.safeParse(n);
    if (!result.success) {
      throw new ValidationError(
        `Validation failed for node at index ${i}: ${result.error?.errors.map((e) => e.message).join(', ') || 'Unknown validation error'}`
      );
    }

    if (n.id && typeof n.id !== 'string') {
      throw new ValidationError(`Node ID at index ${i} must be a string`);
    }

    const nodeId = n.id || generateId();
    validatedNodes.push({
      ...n,
      id: nodeId,
    });
    importedNodeIds.add(nodeId);
  }

  // 3. Validate all edges against AddEdgeSchema before insertion
  const validatedEdges: any[] = [];
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const result = AddEdgeSchema.safeParse(e);
    if (!result.success) {
      throw new ValidationError(
        `Validation failed for edge at index ${i}: ${result.error?.errors.map((e) => e.message).join(', ') || 'Unknown validation error'}`
      );
    }

    if (e.id && typeof e.id !== 'string') {
      throw new ValidationError(`Edge ID at index ${i} must be a string`);
    }

    validatedEdges.push({
      ...e,
      id: e.id || generateId(),
    });
  }

  const db = getDb(projectSlug);

  // Check if nodes or edges exist for this project
  const existingNode = db.prepare('SELECT 1 FROM nodes WHERE project = ? LIMIT 1').get(projectSlug);
  const existingEdge = db.prepare('SELECT 1 FROM edges WHERE project = ? LIMIT 1').get(projectSlug);

  if ((existingNode || existingEdge) && !params.force) {
    throw new ValidationError(
      'Database is not empty. Bulk importing will overwrite existing data. Pass force: true to proceed.'
    );
  }

  // 4. Validate referential integrity
  const existingNodeIds = new Set<string>();
  if (existingNode && !params.force) {
    const rows = db.prepare('SELECT id FROM nodes WHERE project = ?').all(projectSlug) as {
      id: string;
    }[];
    for (const r of rows) {
      existingNodeIds.add(r.id);
    }
  }

  for (let i = 0; i < validatedEdges.length; i++) {
    const e = validatedEdges[i];
    const sourceExists = importedNodeIds.has(e.source_id) || existingNodeIds.has(e.source_id);
    const targetExists = importedNodeIds.has(e.target_id) || existingNodeIds.has(e.target_id);

    if (!sourceExists || !targetExists) {
      throw new ValidationError(
        `Referential integrity violation at edge index ${i}: source "${e.source_id}" or target "${e.target_id}" does not exist in nodes to be imported or in the existing database.`
      );
    }
  }

  // 5. Handle ID conflicts
  const strategy = params.conflictStrategy || 'skip';
  const conflictResolvedNodes: any[] = [];
  const conflictResolvedEdges: any[] = [];
  const nodeIdMapping = new Map<string, string>();

  // Fetch all existing node IDs for conflict checking
  const dbNodeIds = new Set<string>();
  if (existingNode) {
    const rows = db.prepare('SELECT id FROM nodes WHERE project = ?').all(projectSlug) as {
      id: string;
    }[];
    for (const r of rows) {
      dbNodeIds.add(r.id);
    }
  }

  for (const n of validatedNodes) {
    const hasConflict = dbNodeIds.has(n.id);
    if (hasConflict) {
      if (strategy === 'skip') {
        logger.warn(`Skipping node import with conflicting ID: "${n.id}"`);
        continue;
      } else if (strategy === 'generate_new') {
        const newId = generateId();
        nodeIdMapping.set(n.id, newId);
        conflictResolvedNodes.push({ ...n, id: newId });
        logger.info(`Generated new ID "${newId}" for node with conflicting ID: "${n.id}"`);
      } else {
        // overwrite
        conflictResolvedNodes.push(n);
      }
    } else {
      conflictResolvedNodes.push(n);
    }
  }

  for (const e of validatedEdges) {
    const source_id = nodeIdMapping.get(e.source_id) || e.source_id;
    const target_id = nodeIdMapping.get(e.target_id) || e.target_id;

    let hasConflict = false;
    if (existingEdge) {
      const exists = db
        .prepare('SELECT 1 FROM edges WHERE id = ? AND project = ? LIMIT 1')
        .get(e.id, projectSlug);
      if (exists) hasConflict = true;
    }

    if (hasConflict) {
      if (strategy === 'skip') {
        logger.warn(`Skipping edge import with conflicting ID: "${e.id}"`);
        continue;
      } else if (strategy === 'generate_new') {
        const newId = generateId();
        conflictResolvedEdges.push({ ...e, id: newId, source_id, target_id });
      } else {
        conflictResolvedEdges.push({ ...e, source_id, target_id });
      }
    } else {
      conflictResolvedEdges.push({ ...e, source_id, target_id });
    }
  }

  db.transaction(() => {
    // Overwrite clears project data if strategy is overwrite or force is true
    if (params.force && (strategy === 'overwrite' || !params.conflictStrategy)) {
      db.prepare('DELETE FROM edges WHERE project = ?').run(projectSlug);
      db.prepare('DELETE FROM nodes WHERE project = ?').run(projectSlug);
    }

    // Insert nodes
    const nodeStmt = db.prepare(`
      INSERT INTO nodes (id, type, title, status, project, git_branch, metadata, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type=excluded.type,
        title=excluded.title,
        status=excluded.status,
        git_branch=excluded.git_branch,
        metadata=excluded.metadata,
        tags=excluded.tags,
        updated_at=excluded.updated_at
    `);

    for (const n of conflictResolvedNodes) {
      const now = getCurrentIsoString();
      const metadata =
        typeof n.metadata === 'string' ? n.metadata : JSON.stringify(n.metadata || {});
      const tags = typeof n.tags === 'string' ? n.tags : JSON.stringify(n.tags || []);
      const branch = n.git_branch || 'main';

      nodeStmt.run(
        n.id,
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

    // Insert edges
    const edgeStmt = db.prepare(`
      INSERT INTO edges (id, source_id, target_id, type, properties, project, git_branch, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        source_id=excluded.source_id,
        target_id=excluded.target_id,
        type=excluded.type,
        properties=excluded.properties,
        git_branch=excluded.git_branch
    `);

    for (const e of conflictResolvedEdges) {
      const now = getCurrentIsoString();
      const properties =
        typeof e.properties === 'string' ? e.properties : JSON.stringify(e.properties || {});
      const branch = e.git_branch || 'main';

      edgeStmt.run(
        e.id,
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
    `Imported ${conflictResolvedNodes.length} nodes and ${conflictResolvedEdges.length} edges for project ${projectSlug}`
  );

  return {
    imported_nodes_count: conflictResolvedNodes.length,
    imported_edges_count: conflictResolvedEdges.length,
  };
}
