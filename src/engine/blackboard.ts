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

export function setBlackboard(params: {
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

export function postBlackboard(params: {
  project?: string;
  agent_id?: string;
  agent_role?: string;
  topic: string;
  content: string;
  ttl_seconds?: number;
}): BlackboardItem {
  return setBlackboard(params);
}

export function getBlackboard(params: {
  project?: string;
  topic?: string;
  id?: string;
  limit?: number;
}): BlackboardItem[] | BlackboardItem | null {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);
  const now = getCurrentIsoString();

  // Purge expired entries
  db.prepare('DELETE FROM blackboard WHERE expires_at IS NOT NULL AND expires_at < ?').run(now);

  if (params.id) {
    const row = db
      .prepare('SELECT * FROM blackboard WHERE project = ? AND id = ?')
      .get(projectSlug, params.id) as any;
    if (!row) return null;
    return {
      id: row.id,
      project: row.project,
      agent_id: row.agent_id,
      agent_role: row.agent_role,
      topic: row.topic,
      content: row.content,
      created_at: row.created_at,
      expires_at: row.expires_at || undefined,
    };
  }

  const limit = params.limit || 20;
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

export function readBlackboard(params: {
  project?: string;
  topic?: string;
  limit?: number;
}): BlackboardItem[] {
  const result = getBlackboard(params);
  return Array.isArray(result) ? result : result ? [result] : [];
}

export function deleteBlackboard(params: { project?: string; id?: string; topic?: string }): {
  success: boolean;
  deleted_count: number;
} {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  if (params.id) {
    const info = db
      .prepare('DELETE FROM blackboard WHERE project = ? AND id = ?')
      .run(projectSlug, params.id);
    return { success: info.changes > 0, deleted_count: info.changes };
  }

  if (params.topic) {
    const info = db
      .prepare('DELETE FROM blackboard WHERE project = ? AND topic = ?')
      .run(projectSlug, params.topic);
    return { success: info.changes > 0, deleted_count: info.changes };
  }

  return { success: false, deleted_count: 0 };
}

export function leaseBlackboard(params: {
  project?: string;
  resource_id?: string;
  topic?: string;
  agent_id: string;
  duration_seconds?: number;
  mode?: 'acquire' | 'release';
}): { success: boolean; message: string; expires_at?: string } {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);
  const resource = params.resource_id || params.topic;
  if (!resource) {
    return {
      success: false,
      message: 'Resource identifier (resource_id or topic) is required for lease.',
    };
  }

  const leaseTopic = `lease:${resource}`;
  const now = getCurrentIsoString();
  const mode = params.mode || 'acquire';

  if (mode === 'release') {
    const res = db
      .prepare('DELETE FROM blackboard WHERE project = ? AND topic = ? AND agent_id = ?')
      .run(projectSlug, leaseTopic, params.agent_id);
    return {
      success: res.changes > 0,
      message:
        res.changes > 0
          ? `Lease on "${resource}" released by agent "${params.agent_id}".`
          : `No active lease found on "${resource}" held by agent "${params.agent_id}".`,
    };
  }

  // Acquire mode
  const duration = params.duration_seconds || 60;
  const expiresAt = new Date(Date.now() + duration * 1000).toISOString();

  // Purge expired leases for this resource
  db.prepare(
    'DELETE FROM blackboard WHERE project = ? AND topic = ? AND expires_at IS NOT NULL AND expires_at < ?'
  ).run(projectSlug, leaseTopic, now);

  // Check if active lease exists by someone else
  const existing = db
    .prepare(
      'SELECT * FROM blackboard WHERE project = ? AND topic = ? AND (expires_at IS NULL OR expires_at > ?)'
    )
    .get(projectSlug, leaseTopic, now) as any;

  if (existing && existing.agent_id !== params.agent_id) {
    return {
      success: false,
      message: `Resource "${resource}" is currently leased by agent "${existing.agent_id}" until ${existing.expires_at}.`,
      expires_at: existing.expires_at || undefined,
    };
  }

  // Clean prior lease for this resource
  db.prepare('DELETE FROM blackboard WHERE project = ? AND topic = ?').run(projectSlug, leaseTopic);

  const id = generateId();
  db.prepare(
    `INSERT INTO blackboard (id, project, agent_id, agent_role, topic, content, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    projectSlug,
    params.agent_id,
    'coordinator',
    leaseTopic,
    JSON.stringify({ resource, status: 'leased', leased_by: params.agent_id }),
    now,
    expiresAt
  );

  return {
    success: true,
    message: `Resource "${resource}" successfully leased by agent "${params.agent_id}" for ${duration}s.`,
    expires_at: expiresAt,
  };
}

export function listBlackboard(params: {
  project?: string;
  limit?: number;
  topic_prefix?: string;
}): { topics: string[]; count: number } {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);
  const now = getCurrentIsoString();
  const limit = params.limit || 50;

  // Purge expired entries
  db.prepare('DELETE FROM blackboard WHERE expires_at IS NOT NULL AND expires_at < ?').run(now);

  let sql = 'SELECT DISTINCT topic FROM blackboard WHERE project = ?';
  const sqlParams: any[] = [projectSlug];

  if (params.topic_prefix) {
    sql += ' AND topic LIKE ?';
    sqlParams.push(`${params.topic_prefix}%`);
  }

  sql += ' ORDER BY topic ASC LIMIT ?';
  sqlParams.push(limit);

  const rows = db.prepare(sql).all(...sqlParams) as { topic: string }[];
  const topics = rows.map((r) => r.topic);
  return { topics, count: topics.length };
}
