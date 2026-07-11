import {
  TraceDependenciesSchema,
  FindBlockersSchema,
  FindBlockedTasksSchema,
  GetProjectSummarySchema,
  DecisionTrailSchema,
  CriticalPathSchema,
  ImpactAnalysisSchema,
  DetectContradictionsSchema,
  GetContextSnapshotSchema,
  FindRelatedDecisionsSchema,
  ValueMetricsSchema,
  NextTasksSchema,
  GetStaleNodesSchema,
} from '../schema/schemas.js';
import { AnalyticsEngine } from '../engine/analytics.js';
import { getNextTasks } from '../engine/work-queue.js';
import { getStaleNodes } from '../engine/staleness.js';
import { getDb, getProjectSlug } from '../engine/db.js';
import { parseArgs } from './helper.js';

export const analyticsHandlers = {
  trace_dependencies: (args: any) => {
    const data = parseArgs(TraceDependenciesSchema, args);
    return AnalyticsEngine.traceDependencies({
      ...data,
      direction: data.direction as 'upstream' | 'downstream',
    });
  },
  find_blockers: (args: any) => {
    const data = parseArgs(FindBlockersSchema, args);
    return AnalyticsEngine.findBlockers(data);
  },
  find_blocked_tasks: (args: any) => {
    const data = parseArgs(FindBlockedTasksSchema, args);
    return AnalyticsEngine.findBlockedTasks(data);
  },
  get_project_summary: (args: any) => {
    const data = parseArgs(GetProjectSummarySchema, args);
    return AnalyticsEngine.getProjectSummary(data);
  },
  decision_trail: (args: any) => {
    const data = parseArgs(DecisionTrailSchema, args);
    return AnalyticsEngine.decisionTrail(data);
  },
  critical_path: (args: any) => {
    const data = parseArgs(CriticalPathSchema, args);
    return AnalyticsEngine.criticalPath(data);
  },
  impact_analysis: (args: any) => {
    const data = parseArgs(ImpactAnalysisSchema, args);
    return AnalyticsEngine.impactAnalysis(data);
  },
  detect_contradictions: (args: any) => {
    const data = parseArgs(DetectContradictionsSchema, args);
    return AnalyticsEngine.detectContradictions(data);
  },
  get_context_snapshot: (args: any) => {
    const data = parseArgs(GetContextSnapshotSchema, args);
    return AnalyticsEngine.getContextSnapshot(data);
  },
  find_related_decisions: (args: any) => {
    const data = parseArgs(FindRelatedDecisionsSchema, args);
    return AnalyticsEngine.findRelatedDecisions(data);
  },
  value_metrics: (args: any) => {
    const data = parseArgs(ValueMetricsSchema, args);
    return AnalyticsEngine.valueMetrics(data);
  },
  next_tasks: (args: any) => {
    const data = parseArgs(NextTasksSchema, args);
    const projectSlug = getProjectSlug(data.project);
    const db = getDb(projectSlug);
    return getNextTasks(db, {
      project: projectSlug,
      git_branch: data.git_branch,
      limit: data.limit,
      include_context: data.include_context,
    });
  },
  get_stale_nodes: (args: any) => {
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
  },
};
