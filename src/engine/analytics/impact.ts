import { BaseNode } from '../../schema/types.js';
import { traceDependencies } from './dependencies.js';

export function impactAnalysis(params: { project?: string; node_id: string; max_depth?: number }): {
  affected_nodes: BaseNode[];
} {
  const maxDepth = params.max_depth !== undefined ? params.max_depth : 20;
  const trace = traceDependencies({
    project: params.project,
    node_id: params.node_id,
    direction: 'downstream',
    edge_types: ['depends_on', 'blocks', 'child_of', 'updates', 'part_of', 'implements'],
    max_depth: maxDepth,
  });

  const affected_nodes = trace.chain.map((item) => item.node);
  return { affected_nodes };
}
