import { McpError, ErrorCode } from '../utils/errors.js';
import {
  NextTasksSchema,
  CompleteTaskSchema,
  FindBlockedTasksSchema,
  GetStaleNodesSchema,
  FindBlockersSchema,
  FindSimilarBlockersSchema,
  AutoPruneStaleTasksSchema,
} from '../schema/schemas.js';
import { completeTask } from '../engine/complete-task.js';
import { getNextTasks } from '../engine/work-queue.js';
import { getStaleNodes, autoPruneStaleTasks } from '../engine/staleness.js';
import { AnalyticsEngine, findSimilarBlockers } from '../engine/analytics.js';
import { getDb, getProjectSlug } from '../engine/db.js';
import { parseArgs } from './helper.js';

export const batchHandlers = {
  manage_tasks: (args: unknown) => {
    const action = (args as any)?.action;
    if (!action) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Parameter "action" is required for manage_tasks.'
      );
    }

    switch (action) {
      case 'next': {
        const data = parseArgs(NextTasksSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return getNextTasks(db, {
          project: projectSlug,
          git_branch: data.git_branch,
          limit: data.limit,
          include_context: data.include_context,
        });
      }
      case 'complete': {
        const data = parseArgs(CompleteTaskSchema, args);
        return completeTask(data);
      }
      case 'find_blocked': {
        const data = parseArgs(FindBlockedTasksSchema, args);
        return AnalyticsEngine.findBlockedTasks(data);
      }
      case 'find_stale': {
        const data = parseArgs(GetStaleNodesSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return getStaleNodes(db, {
          project: projectSlug,
          older_than: data.older_than,
          status: data.status,
          type: data.type,
          git_branch: data.git_branch,
          limit: data.limit,
        });
      }
      case 'find_blockers': {
        const data = parseArgs(FindBlockersSchema, args);
        return AnalyticsEngine.findBlockers(data);
      }
      case 'find_similar_blockers': {
        const data = parseArgs(FindSimilarBlockersSchema, args);
        return findSimilarBlockers(data);
      }
      case 'auto_prune': {
        const data = parseArgs(AutoPruneStaleTasksSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return autoPruneStaleTasks(db, {
          project: projectSlug,
          older_than: data.older_than,
          target_status: data.target_status,
        });
      }
      default:
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid action "${action}" for manage_tasks. Supported actions: next, complete, find_blocked, find_stale, find_blockers, find_similar_blockers, auto_prune.`
        );
    }
  },
};
