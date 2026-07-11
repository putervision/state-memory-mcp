import { getDb, getProjectSlug } from '../db.js';
import { detectContradictions } from './contradictions.js';

export function valueMetrics(params: { project?: string }): {
  total_nodes: number;
  total_edges: number;
  graph_age_days: number;
  estimated_sessions: number;
  context_switches_saved: number;
  dependency_lookups_saved: number;
  estimated_tokens_stored: number;
  estimated_tokens_saved: number;
  estimated_time_saved_minutes: number;
  graph_density: number;
  average_degree: number;
  orphan_node_count: number;
  decision_reuse_rate: number;
  contradiction_count: number;
  task_completion_rate: number;
  task_velocity_per_day: number;
  blocker_avg_resolution_hours: number;
  blocker_active_count: number;
  artifact_freshness_rate: number;
  plan_completion_rate: number;
  markdown_summary: string;
} {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  interface NodeGroupRow {
    type: string;
    status: string;
    count: number;
    text_len: number | null;
    min_created: string | null;
    max_created: string | null;
  }

  const nodeGroups = db.prepare(`
    SELECT type, status, COUNT(*) as count, SUM(LENGTH(title) + LENGTH(metadata)) as text_len, MIN(created_at) as min_created, MAX(created_at) as max_created
    FROM nodes
    WHERE project = ?
    GROUP BY type, status
  `).all(projectSlug) as NodeGroupRow[];

  let nodeCount = 0;
  let acceptedDecisions = 0;
  let blockerActiveCount = 0;
  let nodeTextLength = 0;
  let firstCreated: string | null = null;
  let lastCreated: string | null = null;
  
  let totalTasks = 0;
  let doneTasks = 0;
  let totalArtifacts = 0;
  let currentArtifacts = 0;
  let totalPlansNonDraft = 0;
  let completedPlans = 0;

  for (const group of nodeGroups) {
    const count = group.count;
    nodeCount += count;
    nodeTextLength += group.text_len || 0;

    if (group.min_created && (!firstCreated || group.min_created < firstCreated)) {
      firstCreated = group.min_created;
    }
    if (group.max_created && (!lastCreated || group.max_created > lastCreated)) {
      lastCreated = group.max_created;
    }

    if (group.type === 'decision' && group.status === 'accepted') {
      acceptedDecisions += count;
    }
    if (group.type === 'blocker' && group.status === 'active') {
      blockerActiveCount += count;
    }
    if (group.type === 'task') {
      totalTasks += count;
      if (group.status === 'done') {
        doneTasks += count;
      }
    }
    if (group.type === 'artifact') {
      totalArtifacts += count;
      if (group.status === 'current') {
        currentArtifacts += count;
      }
    }
    if (group.type === 'plan') {
      if (group.status !== 'draft') {
        totalPlansNonDraft += count;
      }
      if (group.status === 'completed') {
        completedPlans += count;
      }
    }
  }

  const edgeGroups = db.prepare(`
    SELECT type, COUNT(*) as count, SUM(LENGTH(properties)) as text_len
    FROM edges
    WHERE project = ?
    GROUP BY type
  `).all(projectSlug) as { type: string; count: number; text_len: number | null }[];

  let edgeCount = 0;
  let structuralEdges = 0;
  let edgeTextLength = 0;

  for (const group of edgeGroups) {
    const count = group.count;
    edgeCount += count;
    edgeTextLength += group.text_len || 0;

    if (['depends_on', 'blocks', 'child_of', 'implements', 'part_of'].includes(group.type)) {
      structuralEdges += count;
    }
  }

  let graphAgeDays = 1;
  if (firstCreated && lastCreated) {
    const first = new Date(firstCreated).getTime();
    const last = new Date(lastCreated).getTime();
    graphAgeDays = Math.max(1, Math.ceil((last - first) / (1000 * 60 * 60 * 24)));
  }

  const sessionRow = db
    .prepare('SELECT COUNT(DISTINCT date(created_at)) as count FROM nodes WHERE project = ?')
    .get(projectSlug) as { count: number };
  const estimatedSessions = Math.max(1, sessionRow?.count || 1);

  const resolvedBlockers = db
    .prepare(
      "SELECT created_at, updated_at FROM nodes WHERE project = ? AND type = 'blocker' AND status IN ('resolved', 'mitigated')"
    )
    .all(projectSlug) as { created_at: string; updated_at: string }[];
  let totalBlockerResHours = 0;
  for (const b of resolvedBlockers) {
    const start = new Date(b.created_at).getTime();
    const end = new Date(b.updated_at).getTime();
    totalBlockerResHours += Math.max(0, (end - start) / (1000 * 60 * 60));
  }
  const blockerAvgResHours =
    resolvedBlockers.length > 0
      ? Number((totalBlockerResHours / resolvedBlockers.length).toFixed(1))
      : 0;

  const timeSavedFromDecisions = acceptedDecisions * 10;
  const timeSavedFromDependencies = structuralEdges * 3;
  const timeSavedFromBlockers = resolvedBlockers.length * 15;
  const estimatedTimeSaved =
    timeSavedFromDecisions + timeSavedFromDependencies + timeSavedFromBlockers;

  const totalChars = nodeTextLength + edgeTextLength;
  const estimatedTokensStored = Math.ceil(totalChars / 4);
  const estimatedTokensSaved = estimatedTokensStored * estimatedSessions;

  const graphDensity =
    nodeCount > 1 ? Number((edgeCount / (nodeCount * (nodeCount - 1))).toFixed(4)) : 0;
  const averageDegree = nodeCount > 0 ? Number(((2 * edgeCount) / nodeCount).toFixed(2)) : 0;
  const orphanCount = (
    db
      .prepare(
        `
    SELECT COUNT(*) as count FROM nodes n
    WHERE n.project = ?
      AND NOT EXISTS (
        SELECT 1 FROM edges e
        WHERE e.project = ? AND (e.source_id = n.id OR e.target_id = n.id)
      )
  `
      )
      .get(projectSlug, projectSlug) as { count: number }
  ).count;

  const usedDecisions = (
    db
      .prepare(
        `
    SELECT COUNT(DISTINCT n.id) as count FROM nodes n 
    JOIN edges e ON e.source_id = n.id AND e.type IN ('updates', 'decided_in', 'implements', 'produces')
    WHERE n.project = ? AND n.type = 'decision' AND n.status = 'accepted'
  `
      )
      .get(projectSlug) as { count: number }
  ).count;
  const decisionReuseRate =
    acceptedDecisions > 0 ? Number((usedDecisions / acceptedDecisions).toFixed(2)) : 0;

  const contradictions = detectContradictions({ project: projectSlug });
  const contradictionCount =
    contradictions.blocked_done_tasks.length + contradictions.contradicting_decisions.length;

  const taskCompletionRate = totalTasks > 0 ? Number((doneTasks / totalTasks).toFixed(2)) : 0;
  const taskVelocity = Number((doneTasks / graphAgeDays).toFixed(2));
  const artifactFreshnessRate =
    totalArtifacts > 0 ? Number((currentArtifacts / totalArtifacts).toFixed(2)) : 0;
  const planCompletionRate =
    totalPlansNonDraft > 0 ? Number((completedPlans / totalPlansNonDraft).toFixed(2)) : 0;

  const hoursSaved = (estimatedTimeSaved / 60).toFixed(1);
  const densityPercent = (graphDensity * 100).toFixed(2);
  const reusePercent = (decisionReuseRate * 100).toFixed(0);
  const taskPercent = (taskCompletionRate * 100).toFixed(0);
  const freshnessPercent = (artifactFreshnessRate * 100).toFixed(0);

  const markdownSummary = `
# 📊 State Graph Value & ROI Metrics — "${projectSlug}"

Estimated value added by using the workflow state graph:

### 🚀 Productivity ROI Estimates
* **Estimated Time Saved**: **${hoursSaved} hours** (~${estimatedTimeSaved} minutes)
  * Avoided context-switching: **${acceptedDecisions} accepted decisions** documented (~${timeSavedFromDecisions} min saved).
  * Avoided dependency lookups: **${structuralEdges} structural edges** mapped (~${timeSavedFromDependencies} min saved).
  * Avoided blocker stalls: **${resolvedBlockers.length} blockers** resolved (~${timeSavedFromBlockers} min saved).
* **Estimated Token Savings**: **${estimatedTokensSaved.toLocaleString()} tokens**
  * Stored context: **${estimatedTokensStored.toLocaleString()} tokens** captured across nodes and relationships.
  * Reused context: Saved over **${estimatedSessions} development sessions** by preventing manual context reconstruction.

### 📈 Graph Health & Structure
* **Total Nodes / Edges**: **${nodeCount}** nodes / **${edgeCount}** edges
* **Graph Density**: **${densityPercent}%** (avg degree **${averageDegree}**)
* **Orphan Nodes**: **${orphanCount}** (unlinked)
* **Decision Reuse Rate**: **${reusePercent}%** of accepted decisions are connected to downstream tasks or milestones.
* **Contradictions**: **${contradictionCount}** active anomalies detected.

### ⏱️ Velocity & Lifecycle Health
* **Task Completion Rate**: **${taskPercent}%** (${doneTasks} of ${totalTasks} tasks completed).
* **Task Velocity**: **${taskVelocity} tasks/day** completed.
* **Average Blocker Resolution**: **${blockerAvgResHours} hours**.
* **Active Blockers / Blocker Age**: **${blockerActiveCount}** active blockers.
* **Artifact Freshness**: **${freshnessPercent}%** current artifacts.
* **Roadmap Plan Progress**: **${(planCompletionRate * 100).toFixed(0)}%** plans completed.
`.trim();

  return {
    total_nodes: nodeCount,
    total_edges: edgeCount,
    graph_age_days: graphAgeDays,
    estimated_sessions: estimatedSessions,
    context_switches_saved: acceptedDecisions,
    dependency_lookups_saved: structuralEdges,
    estimated_tokens_stored: estimatedTokensStored,
    estimated_tokens_saved: estimatedTokensSaved,
    estimated_time_saved_minutes: estimatedTimeSaved,
    graph_density: graphDensity,
    average_degree: averageDegree,
    orphan_node_count: orphanCount,
    decision_reuse_rate: decisionReuseRate,
    contradiction_count: contradictionCount,
    task_completion_rate: taskCompletionRate,
    task_velocity_per_day: taskVelocity,
    blocker_avg_resolution_hours: blockerAvgResHours,
    blocker_active_count: blockerActiveCount,
    artifact_freshness_rate: artifactFreshnessRate,
    plan_completion_rate: planCompletionRate,
    markdown_summary: markdownSummary,
  };
}
