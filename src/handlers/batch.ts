import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  BatchUpdateSchema,
  WhatChangedSchema,
  AddNoteSchema,
  BootstrapSessionSchema,
  CompleteTaskSchema,
  BatchCreateNodesSchema,
  BatchAddEdgesSchema,
} from '../schema/schemas.js';
import { batchUpdate, batchCreateNodes, batchAddEdges } from '../engine/batch.js';
import { bootstrapSession } from '../engine/bootstrap.js';
import { completeTask } from '../engine/complete-task.js';
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
  bootstrap_session: (args: any) => {
    const data = parseArgs(BootstrapSessionSchema, args);
    return bootstrapSession(data);
  },
  complete_task: (args: any) => {
    const data = parseArgs(CompleteTaskSchema, args);
    return completeTask(data);
  },
  batch_create_nodes: (args: any) => {
    const data = parseArgs(BatchCreateNodesSchema, args);
    const projectSlug = getProjectSlug(data.project);
    const db = getDb(projectSlug);
    return batchCreateNodes(db, {
      project: projectSlug,
      nodes: data.nodes,
    });
  },
  batch_add_edges: (args: any) => {
    const data = parseArgs(BatchAddEdgesSchema, args);
    const projectSlug = getProjectSlug(data.project);
    const db = getDb(projectSlug);
    return batchAddEdges(db, {
      project: projectSlug,
      edges: data.edges,
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
