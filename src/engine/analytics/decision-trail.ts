import { getDb, getProjectSlug } from '../db.js';
import { BaseNode, Edge, NodeRow, EdgeRow } from '../../schema/types.js';
import { parseNodeRow, parseEdgeRow } from '../row-mappers.js';

export function decisionTrail(params: { project?: string; node_id: string }): {
  decisions: BaseNode[];
  contradictions: Edge[];
} {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  const rootNode = db
    .prepare("SELECT * FROM nodes WHERE id = ? AND type = 'decision'")
    .get(params.node_id) as any;
  if (!rootNode) {
    throw new Error(`Decision node not found: ${params.node_id}`);
  }

  const upstreamTrail = db
    .prepare(
      `
    WITH RECURSIVE trail(node_id) AS (
      SELECT ?
      UNION
      SELECT e.target_id
      FROM trail t
      JOIN edges e ON e.source_id = t.node_id
      WHERE e.type = 'updates'
    )
    SELECT node_id FROM trail
  `
    )
    .all(params.node_id) as any[];

  const downstreamTrail = db
    .prepare(
      `
    WITH RECURSIVE trail(node_id) AS (
      SELECT ?
      UNION
      SELECT e.source_id
      FROM trail t
      JOIN edges e ON e.target_id = t.node_id
      WHERE e.type = 'updates'
    )
    SELECT node_id FROM trail
  `
    )
    .all(params.node_id) as any[];

  const uniqueIds = Array.from(
    new Set([...upstreamTrail.map((r) => r.node_id), ...downstreamTrail.map((r) => r.node_id)])
  );

  if (uniqueIds.length === 0) {
    return { decisions: [], contradictions: [] };
  }

  let decisionRows: NodeRow[] = [];
  let edgeRows: EdgeRow[] = [];
  const chunkSize = 400;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '?').join(',');

    const dRows = db
      .prepare(`SELECT * FROM nodes WHERE id IN (${placeholders}) AND type = 'decision'`)
      .all(...chunk) as NodeRow[];
    decisionRows.push(...dRows);

    const eRows = db
      .prepare(
        `
      SELECT * FROM edges 
      WHERE project = ? 
        AND type = 'contradicts' 
        AND source_id IN (${placeholders}) 
        AND target_id IN (${placeholders})
    `
      )
      .all(projectSlug, ...chunk, ...chunk) as EdgeRow[];
    edgeRows.push(...eRows);
  }

  const decisions = decisionRows.map(parseNodeRow);
  const contradictions = edgeRows.map(parseEdgeRow);

  return { decisions, contradictions };
}
