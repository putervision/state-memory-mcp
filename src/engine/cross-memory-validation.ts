import fs from 'fs';
import { getDb, getProjectSlug } from './db.js';
import { GraphEngine } from './graph.js';
import { BaseNode } from '../schema/types.js';

export interface BrokenReference {
  node_id: string;
  node_title: string;
  file_path: string;
  reason: string;
}

export interface MemoryValidationResult {
  total_references_checked: number;
  valid_references_count: number;
  broken_references: BrokenReference[];
  healed_nodes_count: number;
}

export function validateMemoryReferences(params: {
  project?: string;
  auto_heal?: boolean;
}): MemoryValidationResult {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  const nodes = db.prepare('SELECT * FROM nodes WHERE project = ?').all(projectSlug) as any[];

  let totalChecked = 0;
  let validCount = 0;
  const broken: BrokenReference[] = [];
  const nodesToHeal: BaseNode[] = [];

  for (const rawNode of nodes) {
    let metadata: Record<string, any> = {};
    try {
      metadata = JSON.parse(rawNode.metadata || '{}');
    } catch {
      // ignore JSON parse error
    }

    // Scan metadata for file paths / file URIs
    const candidatePaths: string[] = [];

    if (metadata.file_path && typeof metadata.file_path === 'string') {
      candidatePaths.push(metadata.file_path);
    }
    if (metadata.filepath && typeof metadata.filepath === 'string') {
      candidatePaths.push(metadata.filepath);
    }
    if (metadata.path && typeof metadata.path === 'string') {
      candidatePaths.push(metadata.path);
    }

    // Also check title or description for file:/// links
    const fileUriRegex = /file:\/\/\/([^\s#")]+)/g;
    const contentToScan = `${rawNode.title} ${JSON.stringify(metadata)}`;
    let match: RegExpExecArray | null;
    while ((match = fileUriRegex.exec(contentToScan)) !== null) {
      candidatePaths.push(`/${match[1]}`);
    }

    for (const filePath of candidatePaths) {
      totalChecked++;
      // Ignore non-absolute file paths
      if (!filePath.startsWith('/')) {
        validCount++;
        continue;
      }

      if (fs.existsSync(filePath)) {
        validCount++;
      } else {
        broken.push({
          node_id: rawNode.id,
          node_title: rawNode.title,
          file_path: filePath,
          reason: 'File does not exist on disk',
        });
        nodesToHeal.push(rawNode);
      }
    }
  }

  let healedCount = 0;
  if (params.auto_heal && nodesToHeal.length > 0) {
    for (const rawNode of nodesToHeal) {
      let meta: Record<string, any> = {};
      try {
        meta =
          typeof rawNode.metadata === 'string'
            ? JSON.parse(rawNode.metadata || '{}')
            : rawNode.metadata || {};
      } catch {}
      meta.reference_validation_warning =
        'Broken external file reference detected during memory validation';

      GraphEngine.updateNode({
        project: projectSlug,
        id: rawNode.id,
        metadata: meta,
      });
      healedCount++;
    }
  }

  return {
    total_references_checked: totalChecked,
    valid_references_count: validCount,
    broken_references: broken,
    healed_nodes_count: healedCount,
  };
}
