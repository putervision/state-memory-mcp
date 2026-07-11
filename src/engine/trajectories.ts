import Database from 'better-sqlite3';
import { EventEngine } from './events.js';

export class TrajectoryEngine {
  /**
   * Export transition logs as JSONL for fine-tuning compiled models
   */
  static exportTrajectories(
    db: Database.Database,
    params: {
      project: string;
      session_id?: string;
      since?: string;
      until?: string;
      limit?: number;
      offset?: number;
    }
  ): string {
    const events = EventEngine.getEventLog(db, {
      project: params.project,
      session_id: params.session_id,
      since: params.since,
      until: params.until,
      limit: params.limit !== undefined ? params.limit : 10000,
      offset: params.offset !== undefined ? params.offset : 0,
    });

    // Reverse chronological events list returned by getEventLog needs to be in chronological order for training!
    const chronologicalEvents = [...events].reverse();

    const lines = chronologicalEvents.map((event) => {
      const entry = {
        event_type: event.event_type,
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        before_state: event.before_state ? JSON.parse(event.before_state) : null,
        after_state: event.after_state ? JSON.parse(event.after_state) : null,
        timestamp: event.timestamp,
        metadata: event.metadata ? JSON.parse(event.metadata) : {},
      };
      return JSON.stringify(entry);
    });

    return lines.join('\n');
  }
}
