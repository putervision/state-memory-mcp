import { getDb, getProjectSlug } from './db.js';

export interface VelocityAnalyticsResult {
  window_days: number;
  tasks_created: number;
  tasks_completed: number;
  avg_cycle_time_hours: number;
  velocity_per_day: number;
  daily_metrics: Array<{ date: string; created: number; completed: number }>;
}

export function getVelocityAnalytics(params: {
  project?: string;
  window_days?: number;
}): VelocityAnalyticsResult {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);
  const windowDays = params.window_days || 14;

  const startDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  // Tasks created within window
  const createdTasks = db
    .prepare(
      "SELECT id, created_at FROM nodes WHERE project = ? AND type = 'task' AND created_at >= ?"
    )
    .all(projectSlug, startDate) as { id: string; created_at: string }[];

  // Tasks completed within window (status = 'done')
  const completedTasks = db
    .prepare(
      "SELECT id, created_at, updated_at FROM nodes WHERE project = ? AND type = 'task' AND status = 'done' AND updated_at >= ?"
    )
    .all(projectSlug, startDate) as { id: string; created_at: string; updated_at: string }[];

  // Calculate cycle times
  let totalCycleTimeMs = 0;
  for (const task of completedTasks) {
    const created = new Date(task.created_at).getTime();
    const updated = new Date(task.updated_at).getTime();
    totalCycleTimeMs += Math.max(0, updated - created);
  }

  const avgCycleTimeHours =
    completedTasks.length > 0
      ? Number((totalCycleTimeMs / (completedTasks.length * 3600 * 1000)).toFixed(2))
      : 0;

  const velocityPerDay = Number((completedTasks.length / windowDays).toFixed(2));

  // Build daily breakdown
  const dailyMap: Record<string, { created: number; completed: number }> = {};
  for (let i = 0; i < windowDays; i++) {
    const dateStr = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    dailyMap[dateStr] = { created: 0, completed: 0 };
  }

  for (const task of createdTasks) {
    const dateStr = task.created_at.split('T')[0];
    if (dailyMap[dateStr]) dailyMap[dateStr].created++;
  }
  for (const task of completedTasks) {
    const dateStr = task.updated_at.split('T')[0];
    if (dailyMap[dateStr]) dailyMap[dateStr].completed++;
  }

  const daily_metrics = Object.keys(dailyMap)
    .sort()
    .map((date) => ({
      date,
      created: dailyMap[date].created,
      completed: dailyMap[date].completed,
    }));

  return {
    window_days: windowDays,
    tasks_created: createdTasks.length,
    tasks_completed: completedTasks.length,
    avg_cycle_time_hours: avgCycleTimeHours,
    velocity_per_day: velocityPerDay,
    daily_metrics,
  };
}

export interface BurndownResult {
  total_scope: number;
  remaining_tasks: number;
  completed_tasks: number;
  velocity_per_day: number;
  estimated_days_remaining: number;
  burndown_points: Array<{ date: string; remaining: number; completed: number }>;
}

export function getBurndownChart(params: { project?: string; days?: number }): BurndownResult {
  const projectSlug = getProjectSlug(params.project);
  const db = getDb(projectSlug);
  const days = params.days || 14;

  const allTasks = db
    .prepare(
      "SELECT id, status, created_at, updated_at FROM nodes WHERE project = ? AND type = 'task'"
    )
    .all(projectSlug) as { id: string; status: string; created_at: string; updated_at: string }[];

  const totalScope = allTasks.length;
  const completedTasks = allTasks.filter((t) => t.status === 'done').length;
  const remainingTasks = totalScope - completedTasks;

  const velocity = completedTasks > 0 ? completedTasks / days : 0.5;
  const estimatedDays = velocity > 0 ? Math.ceil(remainingTasks / velocity) : 0;

  const points: Array<{ date: string; remaining: number; completed: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const dateStr = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const completedTillDate = allTasks.filter(
      (t) => t.status === 'done' && t.updated_at.split('T')[0] <= dateStr
    ).length;
    points.push({
      date: dateStr,
      remaining: Math.max(0, totalScope - completedTillDate),
      completed: completedTillDate,
    });
  }

  return {
    total_scope: totalScope,
    remaining_tasks: remainingTasks,
    completed_tasks: completedTasks,
    velocity_per_day: Number(velocity.toFixed(2)),
    estimated_days_remaining: estimatedDays,
    burndown_points: points,
  };
}
