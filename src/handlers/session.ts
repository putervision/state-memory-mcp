import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  StartSessionSchema,
  EndSessionSchema,
  ListSessionsSchema,
  BootstrapSessionSchema,
  GetEventLogSchema,
  WhatChangedSchema,
  PostMortemFromSessionSchema,
} from '../schema/schemas.js';
import { SessionEngine } from '../engine/sessions.js';
import { EventEngine } from '../engine/events.js';
import { bootstrapSession } from '../engine/bootstrap.js';
import { getChanges } from '../engine/changeset.js';
import { postMortemFromSession } from '../engine/compound-workflows.js';
import { getDb, getProjectSlug } from '../engine/db.js';
import { parseArgs } from './helper.js';

export const sessionHandlers = {
  manage_sessions: (args: unknown) => {
    const action = (args as any)?.action;
    if (!action) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Parameter "action" is required for manage_sessions.'
      );
    }

    switch (action) {
      case 'start': {
        const data = parseArgs(StartSessionSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return SessionEngine.startSession(db, {
          project: projectSlug,
          agent_id: data.agent_id,
          metadata: data.metadata,
        });
      }
      case 'end': {
        const data = parseArgs(EndSessionSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return SessionEngine.endSession(db, {
          project: projectSlug,
          session_id: data.session_id,
        });
      }
      case 'list': {
        const data = parseArgs(ListSessionsSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return SessionEngine.listSessions(db, {
          project: projectSlug,
          active_only: data.active_only,
          limit: data.limit,
        });
      }
      case 'bootstrap': {
        const data = parseArgs(BootstrapSessionSchema, args);
        return bootstrapSession(data);
      }
      default:
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid action "${action}" for manage_sessions. Supported actions: start, end, list, bootstrap.`
        );
    }
  },

  get_events: (args: unknown) => {
    const action = (args as any)?.action;
    if (!action) {
      throw new McpError(ErrorCode.InvalidParams, 'Parameter "action" is required for get_events.');
    }

    switch (action) {
      case 'log': {
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
      }
      case 'changelog': {
        const data = parseArgs(WhatChangedSchema, args);
        if (!data.since && !data.since_session) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Either since or since_session parameter must be provided for changelog action.'
          );
        }
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return getChanges(db, {
          project: projectSlug,
          since: data.since,
          since_session: data.since_session,
          git_branch: data.git_branch,
        });
      }
      case 'post_mortem': {
        const data = parseArgs(PostMortemFromSessionSchema, args);
        return postMortemFromSession(data);
      }
      default:
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid action "${action}" for get_events. Supported actions: log, changelog, post_mortem.`
        );
    }
  },
};
