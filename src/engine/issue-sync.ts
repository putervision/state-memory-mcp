import { getDb, getProjectSlug } from './db.js';
import { GraphEngine } from './graph.js';
import { BaseNode } from '../schema/types.js';

export interface ExternalIssueInput {
  external_id: string;
  title: string;
  body?: string;
  state?: 'open' | 'closed' | 'pending' | 'done' | string;
  labels?: string[];
}

export interface ExportedIssuePayload {
  external_id?: string;
  node_id: string;
  title: string;
  body: string;
  labels: string[];
  state: 'open' | 'closed';
}

export function exportIssues(params: {
  project?: string;
  format?: 'github' | 'jira' | 'generic';
}): { format: string; issues: ExportedIssuePayload[] } {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);
  const format = params.format || 'github';

  const nodeRows = db
    .prepare("SELECT * FROM nodes WHERE project = ? AND type IN ('task', 'blocker')")
    .all(projectSlug) as any[];

  const issues: ExportedIssuePayload[] = nodeRows.map((r) => {
    let metadata: Record<string, any> = {};
    try {
      metadata = JSON.parse(r.metadata || '{}');
    } catch {}

    let tags: string[] = [];
    try {
      tags = JSON.parse(r.tags || '[]');
    } catch {}

    const state = r.status === 'done' ? 'closed' : 'open';
    const body = metadata.description || `State Memory Node ${r.id} (${r.type})`;

    return {
      external_id: metadata.external_issue_id,
      node_id: r.id,
      title: r.title,
      body,
      labels: [...tags, r.type, r.status],
      state,
    };
  });

  return {
    format,
    issues,
  };
}

export function importIssues(params: { project?: string; issues: ExternalIssueInput[] }): {
  imported_count: number;
  updated_count: number;
  tasks: BaseNode[];
} {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  return db.transaction(() => {
    let imported = 0;
    let updated = 0;
    const resultNodes: BaseNode[] = [];

    for (const issue of params.issues) {
      const status = issue.state === 'closed' || issue.state === 'done' ? 'done' : 'pending';
      const metadata = {
        external_issue_id: issue.external_id,
        description: issue.body || '',
      };

      // Check if task already exists with this external_issue_id
      const existing = db
        .prepare(
          "SELECT id FROM nodes WHERE project = ? AND json_extract(metadata, '$.external_issue_id') = ?"
        )
        .get(projectSlug, issue.external_id) as { id: string } | undefined;

      if (existing) {
        const updatedNode = GraphEngine.updateNode({
          project: projectSlug,
          id: existing.id,
          title: issue.title,
          status,
          metadata,
          tags: issue.labels || [],
        });
        if (updatedNode) {
          resultNodes.push(updatedNode);
          updated++;
        }
      } else {
        const newNode = GraphEngine.addNode({
          project: projectSlug,
          type: 'task',
          title: issue.title,
          status,
          metadata,
          tags: issue.labels || [],
        });
        resultNodes.push(newNode);
        imported++;
      }
    }

    return {
      imported_count: imported,
      updated_count: updated,
      tasks: resultNodes,
    };
  })();
}
