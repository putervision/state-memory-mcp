import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { getProjectSlug, resolveProjectRoot, getDb, getProjectDbDir } from '../../engine/db.js';
import { scanGit } from '../../engine/git-scanner.js';
import { AnalyticsEngine } from '../../engine/analytics.js';
import { exportGraph } from '../../engine/export.js';
import { importGraph } from '../../engine/import.js';
import { backupProjectDb, restoreProjectDb } from '../../engine/backup.js';
import { auditProjectDb } from '../../engine/audit.js';
import { mergeProjectDb } from '../../engine/merge.js';
import { SessionEngine } from '../../engine/sessions.js';
import { EventEngine } from '../../engine/events.js';
import { TrajectoryEngine } from '../../engine/trajectories.js';
import { logger } from '../../utils/logger.js';
import { parsePositiveInt, Table } from '../helper.js';

export async function scanGitAction(options: {
  project?: string;
  commits?: string;
  taskCommitLimit?: string;
  taskAvoidWords?: string;
}) {
  const projectSlug = getProjectSlug(options.project);
  const root = resolveProjectRoot(options.project);
  logger.info(`Scanning git history for project: ${projectSlug}`);

  try {
    const commitsCount = parsePositiveInt(options.commits || '30', '--commits', 30);
    const limit = options.taskCommitLimit !== undefined ? parsePositiveInt(options.taskCommitLimit, '--task-commit-limit', 5) : undefined;
    const avoidWords = options.taskAvoidWords ? options.taskAvoidWords.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const result = await scanGit(projectSlug, root, {
      commits: commitsCount,
      createTasks: true,
      createArtifacts: true,
      taskCommitLimit: limit,
      taskAvoidWords: avoidWords
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error: any) {
    logger.error('Git scan failed:', error.message);
  }
}

export async function metricsAction(options: { project?: string }) {
  const projectSlug = getProjectSlug(options.project);
  logger.info(`Calculating metrics for project: ${projectSlug}`);

  try {
    const metrics = AnalyticsEngine.valueMetrics({ project: projectSlug });
    console.log('\n' + metrics.markdown_summary + '\n');
  } catch (error: any) {
    logger.error('Failed to calculate metrics:', error.message);
  }
}

export async function viewAction(options: { project?: string }) {
  const projectDbDir = getProjectDbDir(options.project);

  if (!fs.existsSync(projectDbDir)) {
    fs.mkdirSync(projectDbDir, { recursive: true });
  }

  try {
    const htmlContent = exportGraph({ project: options.project, format: 'html' });
    const htmlPath = path.join(projectDbDir, 'viewer.html');
    
    fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
    logger.info(`Generated HTML visualization at: ${htmlPath}`);

    const fileUrl = `file://${path.resolve(htmlPath)}`;
    if (process.platform === 'win32') {
      execFile('cmd.exe', ['/c', 'start', '', fileUrl], (err) => {
        if (err) {
          logger.error(`Could not launch browser automatically: ${err.message}`);
          logger.info(`Please open the file manually: ${fileUrl}`);
        } else {
          logger.info(`Opened graph visualizer in your browser: ${fileUrl}`);
        }
      });
    } else {
      const startCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
      execFile(startCmd, [fileUrl], (err) => {
        if (err) {
          logger.error(`Could not launch browser automatically: ${err.message}`);
          logger.info(`Please open the file manually: ${fileUrl}`);
        } else {
          logger.info(`Opened graph visualizer in your browser: ${fileUrl}`);
        }
      });
    }
  } catch (error: any) {
    logger.error('Failed to generate visualizer:', error.message);
  }
}

export async function exportAction(options: { project?: string; format: string; out?: string }) {
  const projectSlug = getProjectSlug(options.project);
  const format = options.format.toLowerCase();
  if (!['json', 'dot', 'mermaid', 'html'].includes(format)) {
    throw new Error(`Invalid format "${options.format}": expected one of json, dot, mermaid, html`);
  }

  try {
    const result = exportGraph({ project: projectSlug, format: format as 'json' | 'dot' | 'mermaid' | 'html' });
    if (options.out) {
      fs.writeFileSync(options.out, result, 'utf-8');
      logger.info(`Exported project ${projectSlug} to ${options.out} in ${format} format`);
    } else {
      console.log(result);
    }
  } catch (error: any) {
    logger.error('Export failed:', error.message);
  }
}

export async function importAction(file: string, options: { project?: string }) {
  const projectSlug = getProjectSlug(options.project);
  logger.info(`Importing data into project: ${projectSlug} from file: ${file}`);

  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const data = JSON.parse(raw);

    if (!data.nodes || !data.edges) {
      throw new Error('JSON file must contain "nodes" and "edges" arrays.');
    }

    const summary = importGraph({
      project: projectSlug,
      nodes: data.nodes,
      edges: data.edges,
    });

    logger.info(`Import completed successfully!`);
    logger.info(`  - Nodes imported: ${summary.imported_nodes_count}`);
    logger.info(`  - Edges imported: ${summary.imported_edges_count}`);
  } catch (error: any) {
    logger.error('Import failed:', error.message);
  }
}

export async function backupAction(options: { project?: string; out?: string }) {
  try {
    const resultPath = await backupProjectDb({
      project: options.project,
      outputPath: options.out
    });
    logger.info(`Backup completed successfully! Saved to: ${resultPath}`);
  } catch (error: any) {
    logger.error('Backup failed:', error.message);
  }
}

export async function restoreAction(file: string, options: { project?: string }) {
  try {
    restoreProjectDb({
      backupPath: file,
      project: options.project
    });
    logger.info(`Database restored successfully from: ${file}`);
  } catch (error: any) {
    logger.error('Restore failed:', error.message);
  }
}

export async function auditAction(options: { project?: string }) {
  const projectSlug = getProjectSlug(options.project);
  logger.info(`Auditing project: ${projectSlug}`);

  try {
    const report = auditProjectDb({ project: options.project });
    
    console.log('\n======================================');
    console.log(` DATABASE AUDIT REPORT: ${projectSlug.toUpperCase()}`);
    console.log('======================================');
    console.log(`Total Nodes: ${report.node_count}`);
    console.log(`Total Edges: ${report.edge_count}`);
    console.log(`SQLite Integrity: ${report.sqlite_integrity.join(', ')}`);
    console.log(`Foreign Key Violations: ${report.foreign_key_violations.length}`);
    console.log(`Orphaned Edges: ${report.orphaned_edges_count}`);
    console.log(`Circular Dependencies (Cycles): ${report.cycles.length}`);
    
    const taskContradictions = report.contradictions.blocked_done_tasks.length;
    const decisionContradictions = report.contradictions.contradicting_decisions.length;
    console.log(`Logical Contradictions: ${taskContradictions + decisionContradictions}`);
    console.log(`  - Blocked Done Tasks: ${taskContradictions}`);
    console.log(`  - Contradicting Decisions: ${decisionContradictions}`);
    
    if (report.cycles.length > 0) {
      console.log('\nCircular Dependencies Found:');
      report.cycles.forEach((cycle, idx) => {
        console.log(`  Cycle ${idx + 1}: ${cycle.join(' -> ')}`);
      });
    }

    if (report.contradictions.blocked_done_tasks.length > 0) {
      console.log('\nBlocked Done Tasks Contradictions:');
      report.contradictions.blocked_done_tasks.forEach((item, idx) => {
        console.log(`  ${idx + 1}: Task "${item.task.title}" (${item.task.id}) is done but blocked by active blocker "${item.blocker.title}" (${item.blocker.id})`);
      });
    }

    if (report.contradictions.contradicting_decisions.length > 0) {
      console.log('\nContradicting Decisions Found:');
      report.contradictions.contradicting_decisions.forEach((item, idx) => {
        console.log(`  ${idx + 1}: Accepted Decision "${item.decision1.title}" (${item.decision1.id}) contradicts Accepted Decision "${item.decision2.title}" (${item.decision2.id})`);
      });
    }

    if (report.warnings.length > 0) {
      console.log('\nWarnings:');
      report.warnings.forEach(warn => {
        console.log(`  ⚠️  ${warn}`);
      });
      console.log('\n❌ Audit completed with warnings/errors.');
    } else {
      console.log('\n✅ Audit completed successfully: No issues detected!');
    }
    console.log('======================================\n');
  } catch (error: any) {
    logger.error('Audit failed:', error.message);
  }
}

export async function mergeAction(file: string, options: { project?: string; force?: boolean }) {
  try {
    const report = mergeProjectDb({
      sourcePath: file,
      project: options.project,
      force: !!options.force
    });

    console.log('\n======================================');
    console.log(` DATABASE MERGE REPORT: ${report.project.toUpperCase()}`);
    console.log('======================================');
    console.log(`Nodes Added:   ${report.nodes_added}`);
    console.log(`Nodes Updated: ${report.nodes_updated}`);
    console.log(`Nodes Skipped: ${report.nodes_skipped}`);
    console.log(`Edges Added:   ${report.edges_added}`);
    console.log(`Edges Skipped: ${report.edges_skipped}`);
    console.log(`Cycles Found:  ${report.cycles_detected.length}`);
    
    if (report.cycles_detected.length > 0) {
      console.log('\nCycles Detected:');
      report.cycles_detected.forEach((cycle, idx) => {
        console.log(`  Cycle ${idx + 1}: ${cycle.join(' -> ')}`);
      });
    }

    if (report.transaction_rolled_back) {
      console.log('\n❌ MERGE FAILED: The merge introduces circular dependencies and was rolled back.');
      console.log('Use --force to override cycle validation and commit the changes anyway.');
    } else {
      console.log('\n✅ MERGE COMPLETED SUCCESSFULLY!');
    }

    if (report.warnings.length > 0) {
      console.log('\nWarnings:');
      report.warnings.forEach(w => {
        console.log(`  ⚠️  ${w}`);
      });
    }
    console.log('======================================\n');
  } catch (error: any) {
    logger.error('Merge failed:', error.message);
  }
}

export async function sessionsAction(options: { project?: string; active?: boolean; limit?: string }) {
  try {
    const projectSlug = getProjectSlug(options.project);
    const db = getDb(projectSlug);
    const limitVal = parsePositiveInt(options.limit || '20', '--limit', 20);
    const list = SessionEngine.listSessions(db, {
      project: projectSlug,
      active_only: !!options.active,
      limit: limitVal,
    });
    console.log('\n======================================');
    console.log(` SESSIONS LOG: ${projectSlug.toUpperCase()}`);
    console.log('======================================');
    if (list.length === 0) {
      console.log('No sessions found.');
    } else {
      const table = new Table({
        head: ['Session ID', 'Agent ID', 'Started At', 'Ended At'],
        colWidths: [26, 20, 25, 25],
      });
      for (const s of list) {
        table.push([
          s.id,
          s.agent_id,
          s.started_at,
          s.ended_at || 'ACTIVE',
        ]);
      }
      console.log(table.toString());
    }
    console.log('======================================\n');
  } catch (error: any) {
    logger.error('Failed to list sessions:', error.message);
  }
}

export async function eventsAction(options: { project?: string; node?: string; type?: string; session?: string; limit?: string }) {
  try {
    const projectSlug = getProjectSlug(options.project);
    const db = getDb(projectSlug);
    const limitVal = parsePositiveInt(options.limit || '50', '--limit', 50);
    const list = EventEngine.getEventLog(db, {
      project: projectSlug,
      entity_id: options.node,
      event_type: options.type,
      session_id: options.session,
      limit: limitVal,
    });
    console.log('\n======================================');
    console.log(` EVENT LOG: ${projectSlug.toUpperCase()}`);
    console.log('======================================');
    if (list.length === 0) {
      console.log('No events found.');
    } else {
      const table = new Table({
        head: ['Event ID', 'Type', 'Entity', 'Entity ID', 'Timestamp'],
        colWidths: [26, 15, 8, 26, 25],
      });
      for (const e of list) {
        table.push([
          e.id,
          e.event_type,
          e.entity_type,
          e.entity_id,
          e.timestamp,
        ]);
      }
      console.log(table.toString());
    }
    console.log('======================================\n');
  } catch (error: any) {
    logger.error('Failed to list events:', error.message);
  }
}

export async function exportTrajectoriesAction(options: { project?: string; session?: string; out?: string }) {
  try {
    const projectSlug = getProjectSlug(options.project);
    const db = getDb(projectSlug);
    const trajectories = TrajectoryEngine.exportTrajectories(db, {
      project: projectSlug,
      session_id: options.session,
    });
    if (options.out) {
      fs.writeFileSync(options.out, trajectories, 'utf-8');
      logger.info(`Trajectories successfully exported to: ${options.out}`);
    } else {
      console.log(trajectories);
    }
  } catch (error: any) {
    logger.error('Failed to export trajectories:', error.message);
  }
}
