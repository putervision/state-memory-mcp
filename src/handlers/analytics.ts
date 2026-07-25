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
  traceback_to_node: (args: any) => {
    const projectSlug = getProjectSlug(args?.project);
    const targetNodeId = args?.target_node_id;
    const reason = args?.reason || 'Downstream execution failure detected.';
    const db = getDb(projectSlug);
    const node = db.prepare('SELECT * FROM nodes WHERE project = ? AND id = ?').get(projectSlug, targetNodeId) as any;
    if (!node) {
      return { success: false, error: `Target node "${targetNodeId}" not found.` };
    }
    db.prepare('UPDATE nodes SET status = ? WHERE project = ? AND id = ?').run('in_progress', projectSlug, targetNodeId);
    return {
      success: true,
      project: projectSlug,
      target_node_id: targetNodeId,
      status: 'in_progress',
      reason,
      message: `State execution reset back to validated node "${targetNodeId}". Task set to in_progress.`
    };
  },
  get_cognitive_load: (args: any) => {
    const projectSlug = getProjectSlug(args?.project);
    const db = getDb(projectSlug);
    const totalNodes = (db.prepare('SELECT COUNT(*) as count FROM nodes WHERE project = ?').get(projectSlug) as any)?.count || 0;
    const totalEdges = (db.prepare('SELECT COUNT(*) as count FROM edges WHERE project = ?').get(projectSlug) as any)?.count || 0;
    const openBlockers = (db.prepare("SELECT COUNT(*) as count FROM nodes WHERE project = ? AND type = 'blocker' AND status != 'done'").get(projectSlug) as any)?.count || 0;
    
    const ICL = totalEdges * 1.5; // Attentional distance across graph edges
    const ECL = openBlockers * 2.0; // Extraneous clutter
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
      summary: `Active cognitive load for project "${projectSlug}": ICL = ${ICL.toFixed(1)}, ECL = ${ECL.toFixed(1)}. Extraneous load externalized to SQLite.`
    };
  },
};
