import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  GetProjectSummarySchema,
  VelocityAnalyticsSchema,
  BurndownChartSchema,
  ValueMetricsSchema,
  CriticalPathSchema,
  GetContextSnapshotSchema,
  DecisionTrailSchema,
  FindRelatedDecisionsSchema,
  DetectContradictionsSchema,
  ValidateGraphSchema,
  DoctorReportSchema,
  ValidateMemoryReferencesSchema,
  CompactGraphSchema,
  ArchiveCompletedNodesSchema,
  PruneEventsSchema,
  AppVersionSchema,
  DedupeGraphSchema,
} from '../schema/schemas.js';
import { VERSION } from '../utils/version.js';
import { AnalyticsEngine } from '../engine/analytics.js';
import { getVelocityAnalytics, getBurndownChart } from '../engine/velocity-analytics.js';
import { validateMemoryReferences } from '../engine/cross-memory-validation.js';
import { getDoctorReport } from '../engine/doctor-watcher.js';
import { validateGraph, ValidateCheck, dedupeGraph } from '../engine/validate.js';
import { EventEngine } from '../engine/events.js';
import { compactGraph, archiveCompletedNodes } from '../engine/compaction.js';
import { getDb, getProjectSlug } from '../engine/db.js';
import { parseArgs } from './helper.js';

const ICL_EDGE_WEIGHT = 1.5;
const ECL_BLOCKER_WEIGHT = 2.0;

export const analyticsHandlers = {
  get_analytics: (args: unknown) => {
    const action = (args as any)?.action;
    if (!action) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Parameter "action" is required for get_analytics.'
      );
    }

    switch (action) {
      case 'summary': {
        const data = parseArgs(GetProjectSummarySchema, args);
        return AnalyticsEngine.getProjectSummary(data);
      }
      case 'velocity': {
        const data = parseArgs(VelocityAnalyticsSchema, args);
        return getVelocityAnalytics(data);
      }
      case 'burndown': {
        const data = parseArgs(BurndownChartSchema, args);
        return getBurndownChart(data);
      }
      case 'value_metrics': {
        const data = parseArgs(ValueMetricsSchema, args);
        return AnalyticsEngine.valueMetrics(data);
      }
      case 'cognitive_load': {
        const projectSlug = getProjectSlug((args as any)?.project);
        const db = getDb(projectSlug);
        const totalNodes =
          (
            db
              .prepare('SELECT COUNT(*) as count FROM nodes WHERE project = ?')
              .get(projectSlug) as any
          )?.count || 0;
        const totalEdges =
          (
            db
              .prepare('SELECT COUNT(*) as count FROM edges WHERE project = ?')
              .get(projectSlug) as any
          )?.count || 0;
        const openBlockers =
          (
            db
              .prepare(
                "SELECT COUNT(*) as count FROM nodes WHERE project = ? AND type = 'blocker' AND status != 'done'"
              )
              .get(projectSlug) as any
          )?.count || 0;

        const ICL = totalEdges * ICL_EDGE_WEIGHT;
        const ECL = openBlockers * ECL_BLOCKER_WEIGHT;
        const TotalCL = ICL + ECL;

        return {
          project: projectSlug,
          metrics: {
            intrinsic_cognitive_load_ICL: Math.round(ICL * 10) / 10,
            extraneous_cognitive_load_ECL: Math.round(ECL * 10) / 10,
            total_cognitive_load_CL: Math.round(TotalCL * 10) / 10,
          },
          graph_counts: {
            total_nodes: totalNodes,
            total_edges: totalEdges,
            active_blockers: openBlockers,
          },
          paged_context_guarantee: 'Cv = { local SOP for v, vars required by v }',
          summary: `Active cognitive load for project "${projectSlug}": ICL = ${ICL.toFixed(1)}, ECL = ${ECL.toFixed(1)}. Extraneous load externalized to SQLite.`,
        };
      }
      case 'critical_path': {
        const data = parseArgs(CriticalPathSchema, args);
        return AnalyticsEngine.criticalPath(data);
      }
      case 'context_snapshot': {
        const data = parseArgs(GetContextSnapshotSchema, args);
        return AnalyticsEngine.getContextSnapshot(data);
      }
      case 'decision_trail': {
        const data = parseArgs(DecisionTrailSchema, args);
        return AnalyticsEngine.decisionTrail(data);
      }
      case 'find_related_decisions': {
        const data = parseArgs(FindRelatedDecisionsSchema, args);
        return AnalyticsEngine.findRelatedDecisions(data);
      }
      case 'contradictions': {
        const data = parseArgs(DetectContradictionsSchema, args);
        return AnalyticsEngine.detectContradictions(data);
      }
      default:
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid action "${action}" for get_analytics. Supported actions: summary, velocity, burndown, value_metrics, cognitive_load, critical_path, context_snapshot, decision_trail, find_related_decisions, contradictions.`
        );
    }
  },

  run_diagnostics: (args: unknown) => {
    const action = (args as any)?.action;
    if (!action) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Parameter "action" is required for run_diagnostics.'
      );
    }

    switch (action) {
      case 'validate': {
        const data = parseArgs(ValidateGraphSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return validateGraph(db, {
          project: projectSlug,
          checks: data.checks as ValidateCheck[] | undefined,
        });
      }
      case 'doctor': {
        const data = parseArgs(DoctorReportSchema, args);
        return getDoctorReport(data);
      }
      case 'check_refs': {
        const data = parseArgs(ValidateMemoryReferencesSchema, args);
        return validateMemoryReferences(data);
      }
      case 'audit_chain': {
        const projectSlug = getProjectSlug((args as any)?.project);
        const db = getDb(projectSlug);
        return EventEngine.verifyAuditChain(db, projectSlug);
      }
      case 'compact': {
        const data = parseArgs(CompactGraphSchema, args);
        return compactGraph(data);
      }
      case 'archive': {
        const data = parseArgs(ArchiveCompletedNodesSchema, args);
        return archiveCompletedNodes(data);
      }
      case 'prune_events': {
        const data = parseArgs(PruneEventsSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return EventEngine.pruneEvents(db, {
          project: projectSlug,
          older_than: data.older_than,
          dry_run: data.dry_run,
          preserve_types: data.preserve_types,
        });
      }
      case 'version': {
        const data = parseArgs(AppVersionSchema, args);
        const projectSlug = getProjectSlug(data.project);
        return {
          name: '@putervision/state-memory-mcp',
          mcp_name: 'io.github.putervision/state-memory-mcp',
          version: VERSION,
          description:
            'Deterministic, persistent graph server for tracking workflow state, decisions, and blockers.',
          project: projectSlug,
          environment: {
            node_version: process.version,
          },
        };
      }
      case 'dedupe': {
        const data = parseArgs(DedupeGraphSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return dedupeGraph(db, {
          project: projectSlug,
          apply: data.apply,
        });
      }
      default:
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid action "${action}" for run_diagnostics. Supported actions: validate, doctor, check_refs, audit_chain, compact, archive, prune_events, version, dedupe.`
        );
    }
  },
};
