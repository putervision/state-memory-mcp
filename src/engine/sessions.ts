import Database from 'better-sqlite3';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';

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
      metadata?: Record<string, unknown>;
    }
  ): { session_id: string } {
    const id = generateId();
    const started_at = getCurrentIsoString();
    const agent_id = params.agent_id || 'unknown';
    const metadataStr = JSON.stringify(params.metadata || {});

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
