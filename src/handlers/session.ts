import {
  StartSessionSchema,
  EndSessionSchema,
  ListSessionsSchema,
  GetEventLogSchema,
  UndoLastSchema,
  PruneEventsSchema,
  PostBlackboardSchema,
  ReadBlackboardSchema,
} from '../schema/schemas.js';
import { SessionEngine } from '../engine/sessions.js';
import { EventEngine } from '../engine/events.js';
import { postBlackboard, readBlackboard } from '../engine/blackboard.js';
import { getDb, getProjectSlug } from '../engine/db.js';
import { parseArgs } from './helper.js';

export const sessionHandlers = {
  post_blackboard: (args: any) => {
    const data = parseArgs(PostBlackboardSchema, args);
    return postBlackboard(data);
  },
  read_blackboard: (args: any) => {
    const data = parseArgs(ReadBlackboardSchema, args);
    return readBlackboard(data);
  },
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
  list_sessions: (args: any) => {
    const data = parseArgs(ListSessionsSchema, args);
    const projectSlug = getProjectSlug(data.project);
    const db = getDb(projectSlug);
    return SessionEngine.listSessions(db, {
      project: projectSlug,
      active_only: data.active_only,
      limit: data.limit,
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
  verify_audit_chain: (args: any) => {
    const projectSlug = getProjectSlug(args?.project);
    const db = getDb(projectSlug);
    return EventEngine.verifyAuditChain(db, projectSlug);
  },
  subscribe_context_changes: (args: any) => {
    const projectSlug = getProjectSlug(args?.project);
    return {
      status: 'active',
      project: projectSlug,
      subscription: 'Context-Aware Shared Context Store (CA-MCP)',
      message: `Subscribed to state reactor triggers on project "${projectSlug}". Reactor notifications active.`,
    };
  },
};
