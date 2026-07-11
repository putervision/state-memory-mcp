import {
  StartSessionSchema,
  EndSessionSchema,
  GetEventLogSchema,
  UndoLastSchema,
  PruneEventsSchema,
} from '../schema/schemas.js';
import { SessionEngine } from '../engine/sessions.js';
import { EventEngine } from '../engine/events.js';
import { getDb, getProjectSlug } from '../engine/db.js';
import { parseArgs } from './helper.js';

export const sessionHandlers = {
  start_session: (args: any) => {
    const data = parseArgs(StartSessionSchema, args);
    const projectSlug = getProjectSlug(data.project);
    const db = getDb(projectSlug);
    return SessionEngine.startSession(db, {
      project: projectSlug,
      agent_id: data.agent_id,
      metadata: data.metadata,
    });
  },
  end_session: (args: any) => {
    const data = parseArgs(EndSessionSchema, args);
    const projectSlug = getProjectSlug(data.project);
    const db = getDb(projectSlug);
    return SessionEngine.endSession(db, {
      project: projectSlug,
      session_id: data.session_id,
    });
  },
  get_event_log: (args: any) => {
    const data = parseArgs(GetEventLogSchema, args);
    const projectSlug = getProjectSlug(data.project);
    const db = getDb(projectSlug);
    return EventEngine.getEventLog(db, {
      project: projectSlug,
      session_id: data.session_id,
      since: data.since,
      until: data.until,
      limit: data.limit,
      offset: data.offset,
    });
  },
  undo_last: (args: any) => {
    const data = parseArgs(UndoLastSchema, args);
    const projectSlug = getProjectSlug(data.project);
    const db = getDb(projectSlug);
    return EventEngine.undoLast(db, {
      project: projectSlug,
      node_id: data.node_id,
    });
  },
  prune_events: (args: any) => {
    const data = parseArgs(PruneEventsSchema, args);
    const projectSlug = getProjectSlug(data.project);
    const db = getDb(projectSlug);
    return EventEngine.pruneEvents(db, {
      project: projectSlug,
      older_than: data.older_than,
      dry_run: data.dry_run,
      preserve_types: data.preserve_types,
    });
  },
};
