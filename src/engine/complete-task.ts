import { getDb, getProjectSlug } from './db.js';
import { GraphEngine } from './graph.js';
import { EdgeEngine } from './edges.js';
import { CompleteTaskParams, BaseNode, Edge } from '../schema/types.js';

export function completeTask(params: CompleteTaskParams): {
  task: BaseNode;
  artifact?: BaseNode;
  edge?: Edge;
  visual_edge?: Edge;
} {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  return db.transaction(() => {
    const updatedTask = GraphEngine.updateNode({
      project: projectSlug,
      id: params.task_id,
      status: 'done',
    });

    if (!updatedTask) {
      throw new Error(`Task not found: ${params.task_id}`);
    }

    let visualEdge: Edge | undefined;
    if (params.visual_state_id) {
      let visualNode = GraphEngine.getNode({
        project: projectSlug,
        id: params.visual_state_id,
        include_edges: false,
      });

      if (!visualNode) {
        visualNode = GraphEngine.addNode({
          project: projectSlug,
          type: 'visual_state',
          title: `Visual State ${params.visual_state_id}`,
          status: 'active',
          metadata: { visual_state_id: params.visual_state_id },
        }) as any;
      }

      const visualNodeId = (visualNode as any).node
        ? (visualNode as any).node.id
        : (visualNode as any).id;

      visualEdge = EdgeEngine.addEdge({
        project: projectSlug,
        source_id: params.task_id,
        target_id: visualNodeId,
        type: params.visual_relationship || 'renders_state',
      });
    }

    if (params.artifact_title) {
      const artifact = GraphEngine.addNode({
        project: projectSlug,
        type: 'artifact',
        title: params.artifact_title,
        status: 'current',
        metadata: params.artifact_metadata,
        tags: params.tags,
      });

      const edge = EdgeEngine.addEdge({
        project: projectSlug,
        source_id: params.task_id,
        target_id: artifact.id,
        type: 'produces',
      });

      return {
        task: updatedTask,
        artifact,
        edge,
        visual_edge: visualEdge,
      };
    }

    return {
      task: updatedTask,
      visual_edge: visualEdge,
    };
  })();
}
