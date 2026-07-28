import { getDb, getProjectSlug } from './db.js';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';

export interface BlackboardItem {
  id: string;
  project: string;
  agent_id: string;
  agent_role: string;
  topic: string;
  content: string;
  created_at: string;
  expires_at?: string;
}

export function postBlackboard(params: {
  project?: string;
  agent_id?: string;
  agent_role?: string;
  topic: string;
  content: string;
  ttl_seconds?: number;
}): BlackboardItem {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  const id = generateId();
  const agent_id = params.agent_id || 'unknown';
  const agent_role = params.agent_role || 'coder';
  const now = getCurrentIsoString();

  let expires_at: string | undefined = undefined;
  if (params.ttl_seconds && params.ttl_seconds > 0) {
    expires_at = new Date(Date.now() + params.ttl_seconds * 1000).toISOString();
  }

  db.prepare(
    `
    INSERT INTO blackboard (id, project, agent_id, agent_role, topic, content, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    projectSlug,
    agent_id,
    agent_role,
    params.topic,
    params.content,
    now,
    expires_at || null
  );

  return {
    id,
    project: projectSlug,
    agent_id,
    agent_role,
    topic: params.topic,
    content: params.content,
    created_at: now,
    expires_at,
  };
}

export function readBlackboard(params: {
  project?: string;
  topic?: string;
  limit?: number;
}): BlackboardItem[] {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);
  const limit = params.limit || 20;
  const now = getCurrentIsoString();

  // Purge expired entries
  db.prepare('DELETE FROM blackboard WHERE expires_at IS NOT NULL AND expires_at < ?').run(now);

  let sql = 'SELECT * FROM blackboard WHERE project = ?';
  const sqlParams: any[] = [projectSlug];

  if (params.topic) {
    sql += ' AND topic = ?';
    sqlParams.push(params.topic);
  }

  sql += ' ORDER BY rowid ASC LIMIT ?';
  sqlParams.push(limit);

  const rows = db.prepare(sql).all(...sqlParams) as any[];

  return rows.map((r) => ({
    id: r.id,
    project: r.project,
    agent_id: r.agent_id,
    agent_role: r.agent_role,
    topic: r.topic,
    content: r.content,
    created_at: r.created_at,
    expires_at: r.expires_at || undefined,
  }));
}
