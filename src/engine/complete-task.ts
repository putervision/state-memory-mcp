import { getDb, getProjectSlug } from './db.js';
import { GraphEngine } from './graph.js';
import { EdgeEngine } from './edges.js';
import { CompleteTaskParams, BaseNode, Edge } from '../schema/types.js';

export function completeTask(params: CompleteTaskParams): {
  task: BaseNode;
  artifact?: BaseNode;
  edge?: Edge;
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
      };
    }

    return {
      task: updatedTask,
    };
  })();
}
