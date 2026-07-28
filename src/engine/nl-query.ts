import { getDb, getProjectSlug } from './db.js';
import { QueryEngine } from './queries.js';
import { findBlockers } from './analytics/dependencies.js';
import { decisionTrail } from './analytics/decision-trail.js';
import { criticalPath } from './analytics/critical-path.js';
import { getStaleNodes } from './staleness.js';
import { calculateSpecCompliance } from './spec-compliance.js';
import { getNextTasks } from './work-queue.js';
import { BaseNode } from '../schema/types.js';

export interface NLQueryResult {
  query: string;
  intent:
    | 'blockers'
    | 'decisions'
    | 'critical_path'
    | 'stale_nodes'
    | 'spec_compliance'
    | 'dependencies'
    | 'search';
  intent_description: string;
  matched_nodes: BaseNode[];
  structured_details?: any;
  summary: string;
}

export async function executeNLQuery(params: {
  query: string;
  project?: string;
  limit?: number;
}): Promise<NLQueryResult> {
  const projectSlug = getProjectSlug(params.project);
  const q = params.query.toLowerCase().trim();
  const limit = params.limit || 20;

  // Intent Pattern Matching
  const isBlocker = /\b(block|blocking|blocked|stuck|impediment|stopping)\b/.test(q);
  const isDecision = /\b(decision|decisions|why|rationale|decided|choice|architecture)\b/.test(q);
  const isCriticalPath = /\b(critical path|priority|bottleneck|longest chain)\b/.test(q);
  const isStale = /\b(stale|outdated|old|neglected|inactive)\b/.test(q);
  const isSpec = /\b(spec|requirement|compliance|prd|criterion|criteria)\b/.test(q);

  let intent: NLQueryResult['intent'] = 'search';
  let intent_description = 'General graph text search';
  let matched_nodes: BaseNode[] = [];
  let structured_details: any = undefined;
  let summary = '';

  if (isBlocker) {
    intent = 'blockers';
    intent_description = 'Extracted intent: Querying active blockers and blocked tasks.';
    const blockers = findBlockers({ project: projectSlug });
    matched_nodes = blockers.map((b) => b.blocker_node);
    structured_details = blockers;

    if (blockers.length === 0) {
      summary = 'No active blockers found in the state graph.';
    } else {
      summary =
        `Found ${blockers.length} active blocker(s):\n` +
        blockers
          .map(
            (b) =>
              `- [${b.blocker_node.id}] ${b.blocker_node.title} (blocking ${b.blocked_nodes ? b.blocked_nodes.length : 0} node(s))`
          )
          .join('\n');
    }
  } else if (isDecision) {
    intent = 'decisions';
    intent_description = 'Extracted intent: Querying architectural decisions and decision lineage.';
    const db = getDb(projectSlug);
    const keywords = q
      .replace(
        /\b(what|decisions?|were|made|about|why|rationale|decided|choice|architecture|is|are|the|led|to|here)\b/g,
        ''
      )
      .trim();

    let decisionNodes: BaseNode[] = [];
    if (keywords.length > 0) {
      const searchRes = await QueryEngine.searchNodes({
        project: projectSlug,
        query: keywords,
        type: 'decision',
        limit,
      });
      decisionNodes = searchRes.nodes;
    }

    if (decisionNodes.length === 0) {
      const listRes = db
        .prepare(
          `SELECT * FROM nodes WHERE project = ? AND type = 'decision' ORDER BY created_at DESC LIMIT ?`
        )
        .all(projectSlug, limit) as any[];
      decisionNodes = listRes.map((row) => ({
        ...row,
        metadata: JSON.parse(row.metadata || '{}'),
        tags: JSON.parse(row.tags || '[]'),
      }));
    }

    matched_nodes = decisionNodes;
    if (decisionNodes.length > 0) {
      const trail = decisionTrail({ project: projectSlug, node_id: decisionNodes[0].id });
      structured_details = { decisions: decisionNodes, top_lineage: trail };
      summary =
        `Found ${decisionNodes.length} decision node(s):\n` +
        decisionNodes.map((d) => `- [${d.id}] ${d.title} (Status: ${d.status})`).join('\n');
    } else {
      summary = 'No decision nodes matched the query.';
    }
  } else if (isCriticalPath) {
    intent = 'critical_path';
    intent_description = 'Extracted intent: Computing critical path / priority task list.';
    const db = getDb(projectSlug);
    const latestMilestone = db
      .prepare(
        `SELECT id FROM nodes WHERE project = ? AND type = 'milestone' ORDER BY created_at DESC LIMIT 1`
      )
      .get(projectSlug) as { id: string } | undefined;

    if (latestMilestone) {
      const cpResult = criticalPath({ project: projectSlug, milestone_id: latestMilestone.id });
      matched_nodes = cpResult.path;
      structured_details = cpResult;
      summary =
        `Critical path for milestone ${latestMilestone.id} contains ${cpResult.path.length} task(s) (Total estimated hours: ${cpResult.total_estimate_hours}):\n` +
        cpResult.path.map((n) => `- [${n.id}] ${n.title}`).join('\n');
    } else {
      const nextTasksRes = getNextTasks(db, { project: projectSlug, limit });
      matched_nodes = nextTasksRes.tasks.map((t) => t.node);
      structured_details = nextTasksRes;
      summary =
        `No active milestone node found. Retrieved ${matched_nodes.length} unblocked priority task(s):\n` +
        matched_nodes.map((n) => `- [${n.id}] ${n.title}`).join('\n');
    }
  } else if (isStale) {
    intent = 'stale_nodes';
    intent_description = 'Extracted intent: Finding stale or inactive nodes.';
    const db = getDb(projectSlug);
    const staleResult = getStaleNodes(db, { project: projectSlug, older_than: '7d', limit });
    matched_nodes = staleResult.nodes;
    structured_details = staleResult;
    summary =
      `Found ${staleResult.count} stale node(s) (not updated in >7 days):\n` +
      staleResult.nodes
        .slice(0, 10)
        .map((n: BaseNode) => `- [${n.id}] (${n.type}) ${n.title}`)
        .join('\n');
  } else if (isSpec) {
    intent = 'spec_compliance';
    intent_description =
      'Extracted intent: Evaluating spec compliance and unverified requirements.';
    const db = getDb(projectSlug);
    const specComp = calculateSpecCompliance(db, projectSlug);
    structured_details = specComp;
    summary = `Spec Compliance Coverage: ${specComp.coverage_percentage}%. Unfulfilled requirements: ${specComp.unfulfilled_requirements.length}, Unverified criteria: ${specComp.unverified_criteria.length}.`;
  } else {
    intent = 'search';
    intent_description = 'Extracted intent: Full-text hybrid search across state graph nodes.';
    const searchRes = await QueryEngine.searchNodes({
      project: projectSlug,
      query: params.query,
      limit,
    });
    matched_nodes = searchRes.nodes;
    structured_details = { query: params.query, count: searchRes.total_count };
    summary =
      `Search returned ${matched_nodes.length} node(s) matching "${params.query}":\n` +
      matched_nodes.map((n) => `- [${n.id}] (${n.type}) ${n.title}`).join('\n');
  }

  return {
    query: params.query,
    intent,
    intent_description,
    matched_nodes,
    structured_details,
    summary,
  };
}
