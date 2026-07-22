import { getDb, getProjectSlug } from '../db.js';
import { BaseNode, NodeRow } from '../../schema/types.js';
import { parseNodeRow } from '../row-mappers.js';

export function detectContradictions(params: { project?: string }): {
  blocked_done_tasks: { task: BaseNode; blocker: BaseNode }[];
  contradicting_decisions: { decision1: BaseNode; decision2: BaseNode }[];
} {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  const taskContradictions = db
    .prepare(
      `
    SELECT DISTINCT t.id as t_id, b.id as b_id
    FROM nodes t
    JOIN edges e ON e.target_id = t.id
    JOIN nodes b ON e.source_id = b.id
    WHERE t.project = ? AND t.type = 'task' AND t.status = 'done' 
      AND e.type = 'blocks' AND b.type = 'blocker' AND b.status = 'active'
  `
    )
    .all(projectSlug) as any[];

  const depContradictions = db
    .prepare(
      `
    SELECT DISTINCT t.id as t_id, dep.id as b_id
    FROM nodes t
    JOIN edges e ON e.source_id = t.id
    JOIN nodes dep ON e.target_id = dep.id
    WHERE t.project = ? AND t.type = 'task' AND t.status = 'done'
      AND e.type = 'depends_on' AND dep.type = 'task' AND dep.status != 'done' AND dep.status != 'cancelled'
  `
    )
    .all(projectSlug) as any[];

  const allBlockedDone = [...taskContradictions, ...depContradictions];

  const decisionContradictions = db
    .prepare(
      `
    SELECT DISTINCT d1.id as id1, d2.id as id2
    FROM edges e
    JOIN nodes d1 ON e.source_id = d1.id
    JOIN nodes d2 ON e.target_id = d2.id
    WHERE e.project = ? AND e.type = 'contradicts'
      AND d1.type = 'decision' AND d1.status = 'accepted'
      AND d2.type = 'decision' AND d2.status = 'accepted'
  `
    )
    .all(projectSlug) as any[];

  // Collect all unique node IDs across both contradiction queries
  const allNodeIds = Array.from(
    new Set([
      ...allBlockedDone.flatMap((r) => [r.t_id, r.b_id]),
      ...decisionContradictions.flatMap((r) => [r.id1, r.id2]),
    ])
  );

  const nodeMap = new Map<string, BaseNode>();
  if (allNodeIds.length > 0) {
    const placeholders = allNodeIds.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT * FROM nodes WHERE project = ? AND id IN (${placeholders})`)
      .all(projectSlug, ...allNodeIds) as NodeRow[];
    for (const row of rows) {
      nodeMap.set(row.id, parseNodeRow(row));
    }
  }

  const blocked_done_tasks: { task: BaseNode; blocker: BaseNode }[] = [];
  for (const r of allBlockedDone) {
    const task = nodeMap.get(r.t_id);
    const blocker = nodeMap.get(r.b_id);
    if (task && blocker) {
      blocked_done_tasks.push({ task, blocker });
    }
  }

  const contradicting_decisions: { decision1: BaseNode; decision2: BaseNode }[] = [];
  for (const r of decisionContradictions) {
    const d1 = nodeMap.get(r.id1);
    const d2 = nodeMap.get(r.id2);
    if (d1 && d2) {
      contradicting_decisions.push({ decision1: d1, decision2: d2 });
    }
  }

  return { blocked_done_tasks, contradicting_decisions };
}
