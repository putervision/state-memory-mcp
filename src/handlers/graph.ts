import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  GetSubgraphSchema,
  TraceDependenciesSchema,
  QueryGraphSchema,
  NaturalLanguageQuerySchema,
  BackupProjectDbSchema,
  RestoreProjectDbSchema,
  AuditProjectDbSchema,
  MergeProjectDbSchema,
  VCSBranchSyncSchema,
  VCSMergeResolutionSchema,
  PostBlackboardSchema,
  ReadBlackboardSchema,
} from '../schema/schemas.js';
import { QueryEngine } from '../engine/queries.js';
import { AnalyticsEngine } from '../engine/analytics.js';
import { queryGraph } from '../engine/query-raw.js';
import { executeNLQuery } from '../engine/nl-query.js';
import { backupProjectDb, restoreProjectDb } from '../engine/backup.js';
import { auditProjectDb } from '../engine/audit.js';
import { mergeProjectDb } from '../engine/merge.js';
import { vcsBranchSync, vcsMergeResolution } from '../engine/vcs-sync.js';
import { postBlackboard, readBlackboard } from '../engine/blackboard.js';
import { parseArgs } from './helper.js';

export const graphHandlers = {
  manage_database: (args: unknown) => {
    const action = (args as any)?.action;
    if (!action) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Parameter "action" is required for manage_database.'
      );
    }

    switch (action) {
      case 'backup': {
        const data = parseArgs(BackupProjectDbSchema, args);
        return backupProjectDb(data);
      }
      case 'restore': {
        const data = parseArgs(RestoreProjectDbSchema, args);
        return restoreProjectDb(data);
      }
      case 'audit': {
        const data = parseArgs(AuditProjectDbSchema, args);
        return auditProjectDb(data);
      }
      case 'merge': {
        const data = parseArgs(MergeProjectDbSchema, args);
        return mergeProjectDb(data);
      }
      case 'branch_diff': {
        const data = parseArgs(VCSBranchSyncSchema, args);
        return vcsBranchSync(data);
      }
      case 'branch_merge': {
        const data = parseArgs(VCSMergeResolutionSchema, args);
        return vcsMergeResolution(data);
      }
      default:
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid action "${action}" for manage_database. Supported actions: backup, restore, audit, merge, branch_diff, branch_merge.`
        );
    }
  },

  query_graph: (args: unknown) => {
    const action = (args as any)?.action;
    if (!action) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Parameter "action" is required for query_graph.'
      );
    }

    switch (action) {
      case 'subgraph': {
        const data = parseArgs(GetSubgraphSchema, args);
        return QueryEngine.getSubgraph(data);
      }
      case 'trace': {
        const data = parseArgs(TraceDependenciesSchema, args);
        return AnalyticsEngine.traceDependencies({
          ...data,
          direction: data.direction as 'upstream' | 'downstream',
        });
      }
      case 'raw': {
        const data = parseArgs(QueryGraphSchema, args);
        return queryGraph(data);
      }
      case 'natural_language': {
        const data = parseArgs(NaturalLanguageQuerySchema, args);
        return executeNLQuery(data);
      }
      default:
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid action "${action}" for query_graph. Supported actions: subgraph, trace, raw, natural_language.`
        );
    }
  },

  use_blackboard: (args: unknown) => {
    const action = (args as any)?.action;
    if (!action) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Parameter "action" is required for use_blackboard.'
      );
    }

    switch (action) {
      case 'post': {
        const data = parseArgs(PostBlackboardSchema, args);
        return postBlackboard(data);
      }
      case 'read': {
        const data = parseArgs(ReadBlackboardSchema, args);
        return readBlackboard(data);
      }
      default:
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid action "${action}" for use_blackboard. Supported actions: post, read.`
        );
    }
  },
};
