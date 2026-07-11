import {
  SaveSnapshotSchema,
  ListSnapshotsSchema,
  DiffSnapshotsSchema,
  ExportTrajectoriesSchema,
} from '../schema/schemas.js';
import { SnapshotEngine } from '../engine/snapshots.js';
import { TrajectoryEngine } from '../engine/trajectories.js';
import { getDb, getProjectSlug } from '../engine/db.js';
import { parseArgs } from './helper.js';

export const snapshotHandlers = {
  save_snapshot: (args: any) => {
    const data = parseArgs(SaveSnapshotSchema, args);
    const projectSlug = getProjectSlug(data.project);
    const db = getDb(projectSlug);
    return SnapshotEngine.saveSnapshot(db, {
      project: projectSlug,
      session_id: data.session_id,
      force: data.force,
    });
  },
  list_snapshots: (args: any) => {
    const data = parseArgs(ListSnapshotsSchema, args);
    const projectSlug = getProjectSlug(data.project);
    const db = getDb(projectSlug);
    return SnapshotEngine.listSnapshots(db, {
      project: projectSlug,
      limit: data.limit,
    });
  },
  diff_snapshots: (args: any) => {
    const data = parseArgs(DiffSnapshotsSchema, args);
    const projectSlug = getProjectSlug(data.project);
    const db = getDb(projectSlug);
    return SnapshotEngine.diffSnapshots(db, {
      project: projectSlug,
      snapshot_id_a: data.snapshot_id_a,
      snapshot_id_b: data.snapshot_id_b,
    });
  },
  export_trajectories: (args: any) => {
    const data = parseArgs(ExportTrajectoriesSchema, args);
    const projectSlug = getProjectSlug(data.project);
    const db = getDb(projectSlug);
    const trajectories = TrajectoryEngine.exportTrajectories(db, {
      project: projectSlug,
      session_id: data.session_id,
      since: data.since,
      until: data.until,
      limit: data.limit,
      offset: data.offset,
    });
    return {
      content: [{ type: 'text', text: trajectories }],
    };
  },
};
