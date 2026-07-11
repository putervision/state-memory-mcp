import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { BatchUpdateSchema, WhatChangedSchema, AddNoteSchema } from '../schema/schemas.js';
import { batchUpdate } from '../engine/batch.js';
import { getChanges } from '../engine/changeset.js';
import { GraphEngine } from '../engine/graph.js';
import { EdgeEngine } from '../engine/edges.js';
import { getDb, getProjectSlug } from '../engine/db.js';
import { parseArgs } from './helper.js';

export const batchHandlers = {
  batch_update: (args: any) => {
    const data = parseArgs(BatchUpdateSchema, args);
    const projectSlug = getProjectSlug(data.project);
    const db = getDb(projectSlug);
    return batchUpdate(db, {
      project: projectSlug,
      ids: data.ids,
      status: data.status,
      metadata: data.metadata,
      tags: data.tags,
    });
  },
  what_changed: (args: any) => {
    const data = parseArgs(WhatChangedSchema, args);
    if (!data.since && !data.since_session) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Either since or since_session parameter must be provided'
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
  },
  add_note: (args: any) => {
    const data = parseArgs(AddNoteSchema, args);
    const projectSlug = getProjectSlug(data.project);
    const db = getDb(projectSlug);
    return db.transaction(() => {
      const node = GraphEngine.addNode({
        project: projectSlug,
        type: 'observation',
        title: data.text.slice(0, 200),
        metadata: { full_text: data.text },
        tags: data.tags,
      });
      if (data.attach_to) {
        EdgeEngine.addEdge({
          project: projectSlug,
          source_id: node.id,
          target_id: data.attach_to,
          type: 'references',
        });
      }
      return node;
    })();
  },
};
