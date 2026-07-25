import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { generateId } from '../utils/id.js';
import { getCurrentIsoString } from '../utils/time.js';
import { logger } from '../utils/logger.js';
import { DatabaseError } from '../utils/errors.js';
import { parseDuration } from './staleness.js';
import { resolveProjectRoot } from './db.js';
import { loadProjectConfig } from './config.js';

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
  hash?: string | null;
  prev_hash?: string | null;
}

export class EventEngine {
  static droppedEventCount = 0;

  /**
   * Log a state transition event to the database with cryptographic SHA-256 hash chaining (Armstrong 2026)
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
          : (params.before_state ?? null);

      const afterStr =
        typeof params.after_state === 'object' && params.after_state !== null
          ? JSON.stringify(params.after_state)
          : (params.after_state ?? null);

      const metaStr = JSON.stringify(params.metadata || {});

      // Retrieve last event hash for cryptographic chaining H_n = SHA-256(H_{n-1} || event_n)
      let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';
      try {
        const lastEv = db
          .prepare('SELECT hash FROM events WHERE project = ? ORDER BY rowid DESC LIMIT 1')
          .get(params.project) as { hash?: string } | undefined;
        if (lastEv?.hash) {
          prevHash = lastEv.hash;
        }
      } catch {
        // Table may not have hash column yet on legacy DBs
      }

      const payload = `${prevHash}|${id}|${params.event_type}|${params.entity_id}|${afterStr || ''}|${timestamp}`;
      const hash = crypto.createHash('sha256').update(payload).digest('hex');

      try {
        db.prepare(
          `
          INSERT INTO events (id, session_id, event_type, entity_type, entity_id, before_state, after_state, project, timestamp, metadata, hash, prev_hash)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          metaStr,
          hash,
          prevHash
        );
      } catch {
        // Fallback for legacy DBs prior to migration v8
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
      }
    } catch (err: any) {
      EventEngine.droppedEventCount++;
      logger.warn(
        `Failed to log event (${EventEngine.droppedEventCount} total dropped): ${err.message}`
      );
      const isStrictEnv = process.env.STATE_MEMORY_STRICT_AUDIT === 'true';
      let isStrictConfig = false;
      try {
        const root = resolveProjectRoot(params.project);
        const config = loadProjectConfig(root);
        isStrictConfig = !!config.strictAudit;
      } catch {
        // Ignore errors reading config during logging callback
      }
      if (isStrictEnv || isStrictConfig) {
        throw err;
      }
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
      order?: 'ASC' | 'DESC';
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

    const sortOrder = params.order === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY rowid ${sortOrder}`;

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
   * Reverts the last recorded mutation for a node.
   * Note: This method only handles node operations (create, update, delete),
   * not edge operations.
   */
  static undoLast(
    db: Database.Database,
    params: {
      project: string;
      node_id: string;
    }
  ): { success: boolean; undone_event_type: string } {
    // Find the latest active (not undone) event for this node
    const lastEvent = db
      .prepare(
        `
        SELECT * FROM events 
        WHERE project = ? AND entity_id = ? AND entity_type = 'node' 
          AND json_extract(metadata, '$.undone') IS NULL
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

        const row = db.prepare('SELECT rowid FROM nodes WHERE id = ?').get(before.id) as
          { rowid: number } | undefined;
        if (row) {
          try {
            db.prepare(
              `
              INSERT INTO nodes_fts(rowid, title, metadata, tags)
              VALUES (?, ?, ?, ?)
            `
            ).run(
              row.rowid,
              before.title,
              JSON.stringify(before.metadata || {}),
              JSON.stringify(before.tags || [])
            );
          } catch {
            // Ignore FTS update error
          }
        }
      }

      // Instead of deleting, mark the event as undone in its metadata to prevent audit gaps
      let metaObj: Record<string, any> = {};
      if (lastEvent.metadata) {
        try {
          metaObj = JSON.parse(lastEvent.metadata);
        } catch {
          // Fallback to empty object if metadata JSON is malformed
        }
      }
      metaObj.undone = true;
      metaObj.undone_at = getCurrentIsoString();

      db.prepare('UPDATE events SET metadata = ? WHERE id = ?').run(
        JSON.stringify(metaObj),
        lastEvent.id
      );
    })();

    return {
      success: true,
      undone_event_type: lastEvent.event_type,
    };
  }

  /**
   * Prune event logs older than a given duration threshold
   */
  static pruneEvents(
    db: Database.Database,
    params: {
      project: string;
      older_than: string;
      dry_run?: boolean;
      preserve_types?: string[];
    }
  ): { would_delete: number; deleted: number; preserved: number } {
    const dryRun = params.dry_run !== false;
    const thresholdMs = parseDuration(params.older_than);
    const thresholdTime = new Date(Date.now() - thresholdMs).toISOString();

    // Find candidate event IDs for pruning
    let sql = `
      SELECT id FROM events
      WHERE project = ? AND timestamp < ?
        AND rowid NOT IN (SELECT MAX(rowid) FROM events WHERE project = ? GROUP BY entity_type, entity_id)
    `;
    const queryParams: any[] = [params.project, thresholdTime, params.project];

    if (params.preserve_types && params.preserve_types.length > 0) {
      const placeholders = params.preserve_types.map(() => '?').join(',');
      sql += ` AND event_type NOT IN (${placeholders})`;
      queryParams.push(...params.preserve_types);
    }

    const candidateRows = db.prepare(sql).all(...queryParams) as { id: string }[];
    const candidateIds = candidateRows.map((r) => r.id);

    // Get total events before pruning
    const totalRow = db
      .prepare('SELECT COUNT(*) as count FROM events WHERE project = ?')
      .get(params.project) as { count: number };
    const totalBefore = totalRow ? totalRow.count : 0;

    let deleted = 0;
    if (candidateIds.length > 0 && !dryRun) {
      db.transaction(() => {
        // SQLite has 999 parameter limit, chunk deletion if needed
        const chunkSize = 900;
        for (let i = 0; i < candidateIds.length; i += chunkSize) {
          const chunk = candidateIds.slice(i, i + chunkSize);
          const placeholders = chunk.map(() => '?').join(',');
          db.prepare(`DELETE FROM events WHERE id IN (${placeholders})`).run(...chunk);
        }
      })();
      deleted = candidateIds.length;
    }

    const wouldDelete = candidateIds.length;
    const totalAfter = totalBefore - deleted;

    return {
      would_delete: dryRun ? wouldDelete : 0,
      deleted,
      preserved: totalAfter,
    };
  }

  /**
   * Verify the cryptographic SHA-256 audit chain for a project
   */
  static verifyAuditChain(
    db: Database.Database,
    project: string
  ): { valid: boolean; total_events: number; corrupt_event_id?: string; message: string } {
    try {
      const events = db
        .prepare('SELECT * FROM events WHERE project = ? ORDER BY rowid ASC')
        .all(project) as (EventRecord & { hash?: string; prev_hash?: string })[];

      if (events.length === 0) {
        return { valid: true, total_events: 0, message: 'No events logged for project.' };
      }

      let expectedPrevHash = '0000000000000000000000000000000000000000000000000000000000000000';
      let verifiedCount = 0;

      for (const ev of events) {
        if (!ev.hash) continue; // Skip legacy unhashed records

        if (ev.prev_hash && ev.prev_hash !== expectedPrevHash) {
          return {
            valid: false,
            total_events: events.length,
            corrupt_event_id: ev.id,
            message: `Audit chain break detected at event ${ev.id}: prev_hash mismatch.`,
          };
        }

        const payload = `${ev.prev_hash || expectedPrevHash}|${ev.id}|${ev.event_type}|${ev.entity_id}|${ev.after_state || ''}|${ev.timestamp}`;
        const calculatedHash = crypto.createHash('sha256').update(payload).digest('hex');

        if (calculatedHash !== ev.hash) {
          return {
            valid: false,
            total_events: events.length,
            corrupt_event_id: ev.id,
            message: `Cryptographic SHA-256 hash mismatch at event ${ev.id}. Event data may have been tampered with.`,
          };
        }

        expectedPrevHash = ev.hash;
        verifiedCount++;
      }

      return {
        valid: true,
        total_events: events.length,
        message: `Cryptographic audit chain verified: ${verifiedCount} hashed events intact.`,
      };
    } catch (err: any) {
      return { valid: false, total_events: 0, message: `Verification failed: ${err.message}` };
    }
  }
}
