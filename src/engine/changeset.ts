import Database from 'better-sqlite3';
import { EventEngine } from './events.js';
import { BaseNode, Edge } from '../schema/types.js';

export function getChanges(
  db: Database.Database,
  params: {
    project: string;
    since?: string;
    since_session?: string;
    git_branch?: string;
  }
): {
  summary: string;
  nodes_created: BaseNode[];
  nodes_updated: { before: BaseNode; after: BaseNode }[];
  nodes_deleted: { id: string; title: string; type: string }[];
  edges_created: Edge[];
  edges_deleted: Edge[];
  decisions_made: BaseNode[];
  blockers_added: BaseNode[];
  blockers_resolved: BaseNode[];
} {
  let sinceTime = params.since;
  if (params.since_session) {
    const session = db
      .prepare('SELECT started_at FROM sessions WHERE id = ?')
      .get(params.since_session) as { started_at: string } | undefined;
    if (!session) {
      throw new Error(`Session not found: ${params.since_session}`);
    }
    sinceTime = session.started_at;
  }

  if (!sinceTime) {
    throw new Error('Either since or since_session parameter must be provided');
  }

  const events = EventEngine.getEventLog(db, {
    project: params.project,
    since: sinceTime,
    limit: 10000,
  });

  const chronologicalEvents = [...events].reverse();

  const nodesCreated = new Map<string, BaseNode>();
  const nodesUpdated = new Map<string, { before: BaseNode; after: BaseNode }>();
  const nodesDeleted = new Map<string, { id: string; title: string; type: string }>();

  const edgesCreated = new Map<string, Edge>();
  const edgesDeleted = new Map<string, Edge>();

  const decisionsMadeMap = new Map<string, BaseNode>();
  const blockersAddedMap = new Map<string, BaseNode>();
  const blockersResolvedMap = new Map<string, BaseNode>();

  const safeParse = (str: string | null): any => {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  };

  for (const event of chronologicalEvents) {
    const isNode = event.entity_type === 'node';

    if (isNode) {
      const id = event.entity_id;
      const before = safeParse(event.before_state);
      const after = safeParse(event.after_state);

      if (event.event_type === 'node_created' && after) {
        nodesDeleted.delete(id);
        nodesCreated.set(id, after);

        if (after.type === 'decision' && after.status === 'accepted') {
          decisionsMadeMap.set(id, after);
        }
        if (after.type === 'blocker' && after.status === 'active') {
          blockersAddedMap.set(id, after);
        }
      } else if (event.event_type === 'node_updated' && after && before) {
        if (nodesCreated.has(id)) {
          nodesCreated.set(id, after);
        } else {
          const prev = nodesUpdated.get(id);
          nodesUpdated.set(id, {
            before: prev ? prev.before : before,
            after: after,
          });
        }

        if (after.type === 'decision') {
          if (after.status === 'accepted') {
            decisionsMadeMap.set(id, after);
          } else {
            decisionsMadeMap.delete(id);
          }
        }

        if (after.type === 'blocker') {
          if (after.status === 'active') {
            blockersAddedMap.set(id, after);
            blockersResolvedMap.delete(id);
          } else if (after.status === 'resolved' || after.status === 'mitigated') {
            blockersResolvedMap.set(id, after);
            blockersAddedMap.delete(id);
          } else {
            blockersAddedMap.delete(id);
            blockersResolvedMap.delete(id);
          }
        }
      } else if (event.event_type === 'node_deleted' && before) {
        nodesCreated.delete(id);
        nodesUpdated.delete(id);
        decisionsMadeMap.delete(id);
        blockersAddedMap.delete(id);
        blockersResolvedMap.delete(id);
        nodesDeleted.set(id, { id, title: before.title || '', type: before.type || '' });
      }
    } else {
      const id = event.entity_id;
      const before = safeParse(event.before_state);
      const after = safeParse(event.after_state);

      if (event.event_type === 'edge_created' && after) {
        edgesDeleted.delete(id);
        edgesCreated.set(id, after);
      } else if (event.event_type === 'edge_deleted' && before) {
        edgesCreated.delete(id);
        edgesDeleted.set(id, before);
      }
    }
  }

  const filterBranch = params.git_branch;
  const nodesCreatedList = Array.from(nodesCreated.values()).filter(
    (n) => !filterBranch || n.git_branch === filterBranch
  );
  const nodesUpdatedList = Array.from(nodesUpdated.values()).filter(
    (u) => !filterBranch || u.after.git_branch === filterBranch
  );
  const nodesDeletedList = Array.from(nodesDeleted.values());

  const edgesCreatedList = Array.from(edgesCreated.values()).filter(
    (e) => !filterBranch || e.git_branch === filterBranch
  );
  const edgesDeletedList = Array.from(edgesDeleted.values()).filter(
    (e) => !filterBranch || e.git_branch === filterBranch
  );

  const decisionsMadeList = Array.from(decisionsMadeMap.values()).filter(
    (n) => !filterBranch || n.git_branch === filterBranch
  );
  const blockersAddedList = Array.from(blockersAddedMap.values()).filter(
    (n) => !filterBranch || n.git_branch === filterBranch
  );
  const blockersResolvedList = Array.from(blockersResolvedMap.values()).filter(
    (n) => !filterBranch || n.git_branch === filterBranch
  );

  const summaryParts: string[] = [];
  if (nodesCreatedList.length > 0) summaryParts.push(`${nodesCreatedList.length} created`);
  if (nodesUpdatedList.length > 0) summaryParts.push(`${nodesUpdatedList.length} updated`);
  if (nodesDeletedList.length > 0) summaryParts.push(`${nodesDeletedList.length} deleted`);
  if (decisionsMadeList.length > 0)
    summaryParts.push(`${decisionsMadeList.length} decisions accepted`);
  if (blockersAddedList.length > 0)
    summaryParts.push(`${blockersAddedList.length} blockers active`);
  if (blockersResolvedList.length > 0)
    summaryParts.push(`${blockersResolvedList.length} blockers resolved`);

  const summary =
    summaryParts.length > 0
      ? `Changes since ${sinceTime}: ${summaryParts.join(', ')}.`
      : `No changes detected since ${sinceTime}.`;

  return {
    summary,
    nodes_created: nodesCreatedList,
    nodes_updated: nodesUpdatedList,
    nodes_deleted: nodesDeletedList,
    edges_created: edgesCreatedList,
    edges_deleted: edgesDeletedList,
    decisions_made: decisionsMadeList,
    blockers_added: blockersAddedList,
    blockers_resolved: blockersResolvedList,
  };
}
