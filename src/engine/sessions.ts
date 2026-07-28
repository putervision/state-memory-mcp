import Database from 'better-sqlite3';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { logger } from '../utils/logger.js';

export interface SessionRecord {
  id: string;
  agent_id: string;
  project: string;
  started_at: string;
  ended_at: string | null;
  metadata: string;
}

export class SessionEngine {
  /**
   * Starts a new tracked session
   */
  static startSession(
    db: Database.Database,
    params: {
      project: string;
      agent_id?: string;
      agent_role?: string;
      metadata?: Record<string, unknown>;
    }
  ): { session_id: string } {
    if (!params.agent_id) {
      logger.warn(`agent_id is missing in startSession, defaulting to 'unknown'`);
    }

    // Auto-close stale sessions (open for > 24 hours)
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const staleSessions = db
        .prepare(
          'SELECT id FROM sessions WHERE project = ? AND ended_at IS NULL AND started_at < ?'
        )
        .all(params.project, oneDayAgo) as { id: string }[];

      if (staleSessions.length > 0) {
        logger.info(`Auto-closing ${staleSessions.length} stale sessions (open > 24 hours)`);
        const now = getCurrentIsoString();
        for (const session of staleSessions) {
          db.prepare(
            "UPDATE sessions SET ended_at = ?, metadata = json_insert(metadata, '$.auto_closed', 1) WHERE id = ?"
          ).run(now, session.id);
          logger.warn(`Auto-closed stale session: ${session.id}`);
        }
      }
    } catch (err: any) {
      logger.warn(`Failed to clean up stale sessions: ${err.message}`);
    }

    const id = generateId();
    const started_at = getCurrentIsoString();
    const agent_id = params.agent_id || 'unknown';
    const finalMetadata = { ...(params.metadata || {}), agent_role: params.agent_role || 'coder' };
    const metadataStr = JSON.stringify(finalMetadata);

    db.prepare(
      `
      INSERT INTO sessions (id, agent_id, project, started_at, ended_at, metadata)
      VALUES (?, ?, ?, ?, NULL, ?)
    `
    ).run(id, agent_id, params.project, started_at, metadataStr);

    return { session_id: id };
  }

  /**
   * Ends a tracked session, setting its ended_at timestamp
   */
  static endSession(
    db: Database.Database,
    params: {
      project: string;
      session_id: string;
    }
  ): { success: boolean } {
    const session = db
      .prepare('SELECT ended_at FROM sessions WHERE id = ? AND project = ?')
      .get(params.session_id, params.project) as { ended_at: string | null } | undefined;

    if (!session) {
      throw new Error(`Session not found: ${params.session_id}`);
    }
    if (session.ended_at !== null) {
      throw new Error(`Session ${params.session_id} has already been ended`);
    }

    const ended_at = getCurrentIsoString();
    const result = db
      .prepare(
        `
        UPDATE sessions 
        SET ended_at = ? 
        WHERE id = ? AND project = ?
      `
      )
      .run(ended_at, params.session_id, params.project);

    return { success: result.changes > 0 };
  }

  /**
   * Lists sessions in the project
   */
  static listSessions(
    db: Database.Database,
    params: {
      project: string;
      active_only?: boolean;
      limit?: number;
    }
  ): SessionRecord[] {
    let query = 'SELECT * FROM sessions WHERE project = ?';
    const args: any[] = [params.project];

    if (params.active_only) {
      query += ' AND ended_at IS NULL';
    }

    query += ' ORDER BY started_at DESC';

    const limit = params.limit !== undefined ? params.limit : 20;
    query += ' LIMIT ?';
    args.push(limit);

    return db.prepare(query).all(...args) as SessionRecord[];
  }
}
