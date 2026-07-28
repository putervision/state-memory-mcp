import {
  SaveSnapshotSchema,
  ListSnapshotsSchema,
  DiffSnapshotsSchema,
  ExportTrajectoriesSchema,
  GetStateAtTimestampSchema,
  RevertToTimestampSchema,
} from '../schema/schemas.js';
import { SnapshotEngine } from '../engine/snapshots.js';
import { TrajectoryEngine } from '../engine/trajectories.js';
import { getStateAtTimestamp, revertToTimestamp } from '../engine/time-travel.js';
import { getDb, getProjectSlug } from '../engine/db.js';
import { parseArgs } from './helper.js';

export const snapshotHandlers = {
  get_state_at_timestamp: (args: any) => {
    const data = parseArgs(GetStateAtTimestampSchema, args);
    return getStateAtTimestamp(data);
  },
  revert_to_timestamp: (args: any) => {
    const data = parseArgs(RevertToTimestampSchema, args);
    return revertToTimestamp(data);
  },
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
