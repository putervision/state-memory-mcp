import { getDb, getProjectSlug } from './db.js';
import { SessionEngine } from './sessions.js';
import { AnalyticsEngine } from './analytics/index.js';
import { getNextTasks } from './work-queue.js';
import { BootstrapSessionParams } from '../schema/types.js';

export function bootstrapSession(params: BootstrapSessionParams) {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);

  const { session_id } = SessionEngine.startSession(db, {
    project: projectSlug,
    agent_id: params.agent_id,
    metadata: params.metadata,
  });

  const context_snapshot = AnalyticsEngine.getContextSnapshot({ project: projectSlug });

  const next_tasks_res = getNextTasks(db, {
    project: projectSlug,
    limit: params.task_limit !== undefined ? params.task_limit : 5,
  });

  return {
    session_id,
    context_snapshot,
    next_tasks: next_tasks_res.tasks,
    summary: next_tasks_res.summary,
  };
}
