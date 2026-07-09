#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { logger } from './utils/logger.js';
import { resolveProjectRoot, getBaseDir, getProjectSlug, getProjectDbDir } from './engine/db.js';
import { QueryEngine } from './engine/queries.js';
import { exportGraph, importGraph, backupProjectDb, restoreProjectDb, auditProjectDb, mergeProjectDb } from './engine/utils.js';
import { runInit } from './cli/init.js';
import { VERSION } from './utils/version.js';
import { scanGit } from './engine/git-scanner.js';


const program = new Command();

program
  .name('state-graph-mcp')
  .description('MCP server and CLI tool for state-graph-mcp')
  .version(VERSION);

// Default run command to launch MCP server
program
  .command('run', { isDefault: true })
  .description('Start the MCP server (default)')
  .action(async () => {
    logger.info('Starting MCP server...');
    await import('./index.js');
  });

// Init command to scaffold workspace
program
  .command('init')
  .description('Initialize state-graph-mcp in the current project (creates data directory, .gitignore, IDE instructions, MCP configs)')
  .option('--no-git', 'Skip populating graph from git commit history')
  .option('--commits <n>', 'Number of commits to analyze', '30')
  .option('--no-tasks', 'Skip creating task nodes from commits')
  .option('--no-artifacts', 'Skip creating artifact nodes from hot files')
  .action(async (options) => {
    const root = resolveProjectRoot();
    await runInit(root, {
      fromGit: options.git !== false,
      commits: parseInt(options.commits, 10),
      createTasks: options.tasks !== false,
      createArtifacts: options.artifacts !== false
    });
  });

// Scan-git command to incrementally pull git commits into the graph
program
  .command('scan-git')
  .description('Incrementally scan git history into the graph')
  .option('-p, --project <name>', 'Project slug name')
  .option('--commits <n>', 'Number of commits to analyze', '30')
  .action(async (options) => {
    const projectSlug = getProjectSlug(options.project);
    const root = resolveProjectRoot(options.project);
    logger.info(`Scanning git history for project: ${projectSlug}`);

    try {
      const result = await scanGit(projectSlug, root, {
        commits: parseInt(options.commits, 10),
        createTasks: true,
        createArtifacts: true
      });
      console.log(JSON.stringify(result, null, 2));
    } catch (error: any) {
      logger.error('Git scan failed:', error.message);
    }
  });


// Inspect command to display project status overview
program
  .command('inspect')
  .description('Display project graph overview in ASCII format')
  .option('-p, --project <name>', 'Project slug name')
  .action((options) => {
    const projectSlug = getProjectSlug(options.project);
    logger.info(`Inspecting project: ${projectSlug}`);

    try {
      const list = QueryEngine.listNodes({ project: projectSlug, git_branch: '*' });
      
      console.log('\n======================================');
      console.log(` PROJECT STATE SUMMARY: ${projectSlug.toUpperCase()}`);
      console.log('======================================');
      console.log(`Total Nodes: ${list.total_count}`);
      
      const counts: Record<string, number> = {};
      const statusCounts: Record<string, Record<string, number>> = {};

      for (const n of list.nodes) {
        counts[n.type] = (counts[n.type] || 0) + 1;
        if (!statusCounts[n.type]) statusCounts[n.type] = {};
        statusCounts[n.type][n.status] = (statusCounts[n.type][n.status] || 0) + 1;
      }

      console.log('\nNode Type Distribution:');
      for (const [type, count] of Object.entries(counts)) {
        console.log(`  - ${type}: ${count}`);
        const statusMap = statusCounts[type];
        for (const [status, sCount] of Object.entries(statusMap)) {
          console.log(`      * ${status}: ${sCount}`);
        }
      }

      console.log('\nNodes List:');
      for (const n of list.nodes) {
        console.log(`  [${n.type.toUpperCase()}] ${n.title} (Status: ${n.status}) - ID: ${n.id}`);
      }
      console.log('======================================\n');
    } catch (error: any) {
      logger.error('Failed to inspect project:', error.message);
    }
  });

// View command to launch browser visualization
program
  .command('view')
  .description('Open interactive HTML graph visualization in default web browser')
  .option('-p, --project <name>', 'Project slug name')
  .action((options) => {
    const projectDbDir = getProjectDbDir(options.project);

    if (!fs.existsSync(projectDbDir)) {
      fs.mkdirSync(projectDbDir, { recursive: true });
    }

    try {
      const htmlContent = exportGraph({ project: options.project, format: 'html' });
      const htmlPath = path.join(projectDbDir, 'viewer.html');
      
      fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
      logger.info(`Generated HTML visualization at: ${htmlPath}`);

      // Open in default browser
      const fileUrl = `file://${path.resolve(htmlPath)}`;
      const startCmd =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
          ? 'start'
          : 'xdg-open';

      const command = process.platform === 'win32' ? `start "" "${fileUrl}"` : `${startCmd} "${fileUrl}"`;
      
      exec(command, (err) => {
        if (err) {
          logger.error(`Could not launch browser automatically: ${err.message}`);
          logger.info(`Please open the file manually: ${fileUrl}`);
        } else {
          logger.info(`Opened graph visualizer in your browser: ${fileUrl}`);
        }
      });
    } catch (error: any) {
      logger.error('Failed to generate visualizer:', error.message);
    }
  });

// Export command to save graph to dot, mermaid, json, or html
program
  .command('export')
  .description('Export graph to various formats (json, dot, mermaid, html)')
  .option('-p, --project <name>', 'Project slug name')
  .option('-f, --format <type>', 'Format type: json, dot, mermaid, html', 'json')
  .option('-o, --out <file>', 'Output file path (prints to stdout if omitted)')
  .action((options) => {
    const projectSlug = getProjectSlug(options.project);
    const format = options.format.toLowerCase() as 'json' | 'dot' | 'mermaid' | 'html';

    try {
      const result = exportGraph({ project: projectSlug, format });
      if (options.out) {
        fs.writeFileSync(options.out, result, 'utf-8');
        logger.info(`Exported project ${projectSlug} to ${options.out} in ${format} format`);
      } else {
        console.log(result);
      }
    } catch (error: any) {
      logger.error('Export failed:', error.message);
    }
  });

// Import command to load graph from JSON file
program
  .command('import <file>')
  .description('Import graph data from a JSON file (overwrites existing project data)')
  .option('-p, --project <name>', 'Project slug name')
  .action((file, options) => {
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
  });

// Backup command to save database
program
  .command('backup')
  .description('Back up the project database to a SQLite file')
  .option('-p, --project <name>', 'Project slug name')
  .option('-o, --out <file>', 'Output backup file path (auto-generated if omitted)')
  .action(async (options) => {
    try {
      const resultPath = await backupProjectDb({
        project: options.project,
        outputPath: options.out
      });
      logger.info(`Backup completed successfully! Saved to: ${resultPath}`);
    } catch (error: any) {
      logger.error('Backup failed:', error.message);
    }
  });

// Restore command to restore database from backup file
program
  .command('restore <file>')
  .description('Restore the project database from a SQLite backup file (destructively overwrites current database)')
  .option('-p, --project <name>', 'Project slug name')
  .action((file, options) => {
    try {
      restoreProjectDb({
        backupPath: file,
        project: options.project
      });
      logger.info(`Database restored successfully from: ${file}`);
    } catch (error: any) {
      logger.error('Restore failed:', error.message);
    }
  });

// Audit command to run integrity and cycle checks
program
  .command('audit')
  .description('Audit the project database for integrity, cycle paths, and contradictions')
  .option('-p, --project <name>', 'Project slug name')
  .action((options) => {
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
  });

// Merge command to merge an external database
program
  .command('merge <file>')
  .description('Merge an external SQLite database into the current project database')
  .option('-p, --project <name>', 'Project slug name')
  .option('--force', 'Commit the merge even if circular dependencies are introduced')
  .action((file, options) => {
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
  });

program.parse(process.argv);
