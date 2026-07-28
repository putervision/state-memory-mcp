import { getDb, getProjectSlug } from './db.js';
import { GraphEngine } from './graph.js';
import { EdgeEngine } from './edges.js';
import { EventEngine } from './events.js';
import { BaseNode, Edge } from '../schema/types.js';

export interface DecomposeSubtaskInput {
  title: string;
  description?: string;
  depends_on_index?: number;
}

export interface PlanAndDecomposeResult {
  plan: BaseNode;
  milestone?: BaseNode;
  tasks: BaseNode[];
  edges: Edge[];
}

export function planAndDecomposeFeature(params: {
  project?: string;
  title: string;
  description?: string;
  subtasks: DecomposeSubtaskInput[];
  milestone_title?: string;
}): PlanAndDecomposeResult {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  return db.transaction(() => {
    // 1. Create Plan Node
    const plan = GraphEngine.addNode({
      project: projectSlug,
      type: 'plan',
      title: params.title,
      status: 'active',
      metadata: params.description ? { description: params.description } : {},
    });

    let milestone: BaseNode | undefined = undefined;
    if (params.milestone_title) {
      milestone = GraphEngine.addNode({
        project: projectSlug,
        type: 'milestone',
        title: params.milestone_title,
        status: 'in_progress',
      });

      // Link Milestone -> Plan
      EdgeEngine.addEdge({
        project: projectSlug,
        source_id: milestone.id,
        target_id: plan.id,
        type: 'part_of',
      });
    }

    const createdTasks: BaseNode[] = [];
    const createdEdges: Edge[] = [];

    // 2. Create Subtasks & Dependency Edges
    for (let i = 0; i < params.subtasks.length; i++) {
      const sub = params.subtasks[i];
      const taskNode = GraphEngine.addNode({
        project: projectSlug,
        type: 'task',
        title: sub.title,
        status: 'pending',
        metadata: sub.description ? { description: sub.description } : {},
      });
      createdTasks.push(taskNode);

      // Link task to milestone or plan
      const parentId = milestone ? milestone.id : plan.id;
      const partOfEdge = EdgeEngine.addEdge({
        project: projectSlug,
        source_id: taskNode.id,
        target_id: parentId,
        type: 'part_of',
      });
      createdEdges.push(partOfEdge);

      // Link dependencies if specified
      if (
        sub.depends_on_index !== undefined &&
        sub.depends_on_index >= 0 &&
        sub.depends_on_index < i
      ) {
        const depTask = createdTasks[sub.depends_on_index];
        const depEdge = EdgeEngine.addEdge({
          project: projectSlug,
          source_id: taskNode.id,
          target_id: depTask.id,
          type: 'depends_on',
        });
        createdEdges.push(depEdge);
      }
    }

    return {
      plan,
      milestone,
      tasks: createdTasks,
      edges: createdEdges,
    };
  })();
}

export function postMortemFromSession(params: {
  project?: string;
  session_id: string;
  summary_title?: string;
}): { observation: BaseNode; artifact: BaseNode; summary: string } {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  const events = EventEngine.getEventLog(db, {
    project: projectSlug,
    session_id: params.session_id,
    limit: 500,
  });

  const createdNodes = events.filter((e) => e.event_type === 'node_created');
  const updatedNodes = events.filter((e) => e.event_type === 'node_updated');
  const deletedNodes = events.filter((e) => e.event_type === 'node_deleted');

  const title = params.summary_title || `Post-Mortem for Session ${params.session_id}`;
  const now = new Date().toISOString();

  const summary = `Session Post-Mortem (${params.session_id}):
- Total Events: ${events.length}
- Nodes Created: ${createdNodes.length}
- Nodes Updated: ${updatedNodes.length}
- Nodes Deleted: ${deletedNodes.length}`;

  const observation = GraphEngine.addNode({
    project: projectSlug,
    type: 'observation',
    title: `Post-Mortem Observation: ${title}`,
    status: 'active',
    metadata: {
      session_id: params.session_id,
      events_count: events.length,
      nodes_created_count: createdNodes.length,
      nodes_updated_count: updatedNodes.length,
    },
  });

  const artifact = GraphEngine.addNode({
    project: projectSlug,
    type: 'artifact',
    title: `Artifact Report: ${title}`,
    status: 'current',
    metadata: {
      post_mortem: summary,
      session_id: params.session_id,
      generated_at: now,
    },
  });

  EdgeEngine.addEdge({
    project: projectSlug,
    source_id: artifact.id,
    target_id: observation.id,
    type: 'references',
  });

  return {
    observation,
    artifact,
    summary,
  };
}
