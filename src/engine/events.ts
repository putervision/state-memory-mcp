import Database from 'better-sqlite3';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { logger } from '../utils/logger.js';
import { DatabaseError } from '../utils/errors.js';

export interface EventRecord {
  id: string;
  session_id: string | null;
  event_type: 'node_created' | 'node_updated' | 'node_deleted' | 'edge_created' | 'edge_deleted';
  entity_type: 'node' | 'edge';
  entity_id: string;
  before_state: string | null;
  after_state: string | null;
  project: string;
  timestamp: string;
  metadata: string;
}

export class EventEngine {
  /**
   * Log a state transition event to the database
   */
  static logEvent(
    db: Database.Database,
    params: {
      session_id?: string | null;
      event_type: EventRecord['event_type'];
      entity_type: EventRecord['entity_type'];
      entity_id: string;
      before_state?: any;
      after_state?: any;
      project: string;
      metadata?: Record<string, unknown>;
    }
  ): void {
    try {
      const id = generateId();
      const timestamp = getCurrentIsoString();
      const session_id = params.session_id || null;

      const beforeStr =
        typeof params.before_state === 'object' && params.before_state !== null
          ? JSON.stringify(params.before_state)
          : params.before_state || null;

      const afterStr =
        typeof params.after_state === 'object' && params.after_state !== null
          ? JSON.stringify(params.after_state)
          : params.after_state || null;

      const metaStr = JSON.stringify(params.metadata || {});

      db.prepare(
        `
        INSERT INTO events (id, session_id, event_type, entity_type, entity_id, before_state, after_state, project, timestamp, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        id,
        session_id,
        params.event_type,
        params.entity_type,
        params.entity_id,
        beforeStr,
        afterStr,
        params.project,
        timestamp,
        metaStr
      );
    } catch (err: any) {
      logger.error(`Failed to log event: ${err.message}`);
    }
  }

  /**
   * Get the event log for a project with filters
   */
  static getEventLog(
    db: Database.Database,
    params: {
      project: string;
      entity_id?: string;
      event_type?: string;
      session_id?: string;
      since?: string;
      until?: string;
      limit?: number;
      offset?: number;
    }
  ): EventRecord[] {
    let query = 'SELECT * FROM events WHERE project = ?';
    const args: any[] = [params.project];

    if (params.entity_id) {
      query += ' AND entity_id = ?';
      args.push(params.entity_id);
    }
    if (params.event_type) {
      query += ' AND event_type = ?';
      args.push(params.event_type);
    }
    if (params.session_id) {
      query += ' AND session_id = ?';
      args.push(params.session_id);
    }
    if (params.since) {
      query += ' AND timestamp >= ?';
      args.push(params.since);
    }
    if (params.until) {
      query += ' AND timestamp <= ?';
      args.push(params.until);
    }

    query += ' ORDER BY rowid DESC';

    const limit = params.limit !== undefined ? params.limit : 50;
    const offset = params.offset !== undefined ? params.offset : 0;
    query += ' LIMIT ? OFFSET ?';
    args.push(limit, offset);

    return db.prepare(query).all(...args) as EventRecord[];
  }

  /**
   * Get the chronological history of a specific node
   */
  static getNodeHistory(
    db: Database.Database,
    params: {
      project: string;
      node_id: string;
    }
  ): EventRecord[] {
    return db
      .prepare(
        `
        SELECT * FROM events 
        WHERE project = ? AND entity_id = ? AND entity_type = 'node' 
        ORDER BY rowid ASC
      `
      )
      .all(params.project, params.node_id) as EventRecord[];
  }

  /**
   * Reverts the last recorded mutation for a node
   */
  static undoLast(
    db: Database.Database,
    params: {
      project: string;
      node_id: string;
    }
  ): { success: boolean; undone_event_type: string } {
    // Find the latest event for this node
    const lastEvent = db
      .prepare(
        `
        SELECT * FROM events 
        WHERE project = ? AND entity_id = ? AND entity_type = 'node' 
        ORDER BY rowid DESC LIMIT 1
      `
      )
      .get(params.project, params.node_id) as EventRecord | undefined;

    if (!lastEvent) {
      throw new DatabaseError(`No undo history found for node: ${params.node_id}`);
    }

    db.transaction(() => {
      if (lastEvent.event_type === 'node_created') {
        // Revert create -> delete the node
        db.prepare('DELETE FROM nodes WHERE id = ?').run(params.node_id);
      } else if (lastEvent.event_type === 'node_updated') {
        // Revert update -> restore before_state
        if (!lastEvent.before_state) {
          throw new DatabaseError(
            `Cannot undo update on node ${params.node_id}: before_state is null`
          );
        }
        const before = JSON.parse(lastEvent.before_state);
        db.prepare(
          `
          UPDATE nodes 
          SET title = ?, status = ?, metadata = ?, tags = ?, updated_at = ? 
          WHERE id = ?
        `
        ).run(
          before.title,
          before.status,
          JSON.stringify(before.metadata || {}),
          JSON.stringify(before.tags || []),
          before.updated_at,
          params.node_id
        );
      } else if (lastEvent.event_type === 'node_deleted') {
        // Revert delete -> restore the deleted node row
        if (!lastEvent.before_state) {
          throw new DatabaseError(
            `Cannot undo delete on node ${params.node_id}: before_state is null`
          );
        }
        const before = JSON.parse(lastEvent.before_state);
        db.prepare(
          `
          INSERT INTO nodes (id, type, title, status, project, git_branch, metadata, tags, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          before.id,
          before.type,
          before.title,
          before.status,
          before.project,
          before.git_branch || 'main',
          JSON.stringify(before.metadata || {}),
          JSON.stringify(before.tags || []),
          before.created_at,
          before.updated_at
        );
      }

      // Delete the undone event from the events table to clean up
      db.prepare('DELETE FROM events WHERE id = ?').run(lastEvent.id);
    })();

    return {
      success: true,
      undone_event_type: lastEvent.event_type,
    };
  }
}
