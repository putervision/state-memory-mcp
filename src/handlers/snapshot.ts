import { McpError, ErrorCode } from '../utils/errors.js';
import {
  SaveSnapshotSchema,
  ListSnapshotsSchema,
  DiffSnapshotsSchema,
  GetStateAtTimestampSchema,
  RevertToTimestampSchema,
  UndoLastSchema,
  GetNodeHistorySchema,
  ExportGraphSchema,
  ExportIssuesSchema,
  ExportTrajectoriesSchema,
  ExportJointTrajectoriesSchema,
  ExportSynergyMetricsSchema,
  ImportGraphSchema,
  ImportIssuesSchema,
  IngestSpecSchema,
} from '../schema/schemas.js';
import { SnapshotEngine } from '../engine/snapshots.js';
import { TrajectoryEngine } from '../engine/trajectories.js';
import { getStateAtTimestamp, revertToTimestamp } from '../engine/time-travel.js';
import { EventEngine } from '../engine/events.js';
import { exportGraph } from '../engine/export.js';
import { importGraph } from '../engine/import.js';
import { exportIssues, importIssues } from '../engine/issue-sync.js';
import { ingestSpecFile } from '../engine/spec-parser.js';
import { SynergyEngine } from '../engine/synergy.js';
import { getDb, getProjectSlug } from '../engine/db.js';
import { parseArgs } from './helper.js';

export const snapshotHandlers = {
  manage_snapshots: (args: unknown) => {
    const action = (args as any)?.action;
    if (!action) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Parameter "action" is required for manage_snapshots.'
      );
    }

    switch (action) {
      case 'save': {
        const data = parseArgs(SaveSnapshotSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return SnapshotEngine.saveSnapshot(db, {
          project: projectSlug,
          session_id: data.session_id,
          force: data.force,
        });
      }
      case 'list': {
        const data = parseArgs(ListSnapshotsSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return SnapshotEngine.listSnapshots(db, {
          project: projectSlug,
          limit: data.limit,
        });
      }
      case 'diff': {
        const data = parseArgs(DiffSnapshotsSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return SnapshotEngine.diffSnapshots(db, {
          project: projectSlug,
          snapshot_id_a: data.snapshot_id_a,
          snapshot_id_b: data.snapshot_id_b,
        });
      }
      case 'get_state': {
        const data = parseArgs(GetStateAtTimestampSchema, args);
        return getStateAtTimestamp(data);
      }
      case 'revert': {
        const data = parseArgs(RevertToTimestampSchema, args);
        return revertToTimestamp(data);
      }
      case 'undo': {
        const data = parseArgs(UndoLastSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return EventEngine.undoLast(db, {
          project: projectSlug,
          node_id: data.node_id,
        });
      }
      case 'get_history': {
        const data = parseArgs(GetNodeHistorySchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return EventEngine.getNodeHistory(db, {
          project: projectSlug,
          node_id: data.node_id,
        });
      }
      default:
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid action "${action}" for manage_snapshots. Supported actions: save, list, diff, get_state, revert, undo, get_history.`
        );
    }
  },

  manage_data: async (args: unknown) => {
    const action = (args as any)?.action;
    if (!action) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Parameter "action" is required for manage_data.'
      );
    }

    switch (action) {
      case 'export_graph': {
        const data = parseArgs(ExportGraphSchema, args);
        return exportGraph(data);
      }
      case 'export_issues': {
        const data = parseArgs(ExportIssuesSchema, args);
        return exportIssues(data);
      }
      case 'export_trajectories': {
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
        return { content: trajectories };
      }
      case 'export_joint_trajectories': {
        const data = parseArgs(ExportJointTrajectoriesSchema, args);
        return SynergyEngine.exportJointTrajectories(data);
      }
      case 'export_synergy_metrics': {
        const data = parseArgs(ExportSynergyMetricsSchema, args);
        return SynergyEngine.getSynergyMetrics(data);
      }
      case 'import_graph': {
        const data = parseArgs(ImportGraphSchema, args);
        return importGraph(data);
      }
      case 'import_issues': {
        const data = parseArgs(ImportIssuesSchema, args);
        return importIssues(data);
      }
      case 'import_spec': {
        const data = parseArgs(IngestSpecSchema, args);
        const projectSlug = getProjectSlug(data.project);
        const db = getDb(projectSlug);
        return ingestSpecFile(db, {
          filePath: data.file_path,
          format: data.format,
          project: projectSlug,
        });
      }
      default:
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid action "${action}" for manage_data. Supported actions: export_graph, export_issues, export_trajectories, export_joint_trajectories, export_synergy_metrics, import_graph, import_issues, import_spec.`
        );
    }
  },
};
