#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { logger } from './utils/logger.js';
import { resolveProjectRoot, getProjectSlug, getProjectDbDir, getDb } from './engine/db.js';
import { QueryEngine } from './engine/queries.js';
import { exportGraph } from './engine/export.js';
import { importGraph } from './engine/import.js';
import { backupProjectDb, restoreProjectDb } from './engine/backup.js';
import { auditProjectDb } from './engine/audit.js';
import { mergeProjectDb } from './engine/merge.js';
import { runInit } from './cli/init.js';
import { VERSION } from './utils/version.js';
import { scanGit } from './engine/git-scanner.js';
import { AnalyticsEngine } from './engine/analytics.js';
import { SessionEngine } from './engine/sessions.js';
import { EventEngine } from './engine/events.js';
import { TrajectoryEngine } from './engine/trajectories.js';

class Option {
  flags: string;
  description: string;
  defaultValue?: any;
  key: string;
  isFlag: boolean;
  short?: string;
  long?: string;

  constructor(flags: string, description: string, defaultValue?: any) {
    this.flags = flags;
    this.description = description;
    this.defaultValue = defaultValue;

    const parts = flags.split(',').map(s => s.trim());
    for (const part of parts) {
      if (part.startsWith('--')) {
        this.long = part.split(' ')[0];
      } else if (part.startsWith('-')) {
        this.short = part.split(' ')[0];
      }
    }

    const cleanLong = this.long ? this.long.replace(/^--/, '') : '';
    this.isFlag = !flags.includes('<') && !flags.includes('[');

    if (cleanLong.startsWith('no-')) {
      this.key = cleanLong.replace(/^no-/, '');
      this.isFlag = true;
      if (this.defaultValue === undefined) {
        this.defaultValue = true;
      }
    } else {
      this.key = cleanLong || (this.short ? this.short.replace(/^-/, '') : '');
    }
  }
}

class SubCommand {
  nameStr: string;
  descStr: string = '';
  optionsList: Option[] = [];
  actionFn?: (...args: any[]) => void | Promise<void>;
  isDefaultCmd: boolean = false;

  constructor(nameStr: string, isDefault = false) {
    this.nameStr = nameStr;
    this.isDefaultCmd = isDefault;
  }

  description(desc: string): this {
    this.descStr = desc;
    return this;
  }

  option(flags: string, description: string, defaultValue?: any): this {
    this.optionsList.push(new Option(flags, description, defaultValue));
    return this;
  }

  action(fn: (...args: any[]) => void | Promise<void>): this {
    this.actionFn = fn;
    return this;
  }
}

class Command {
  private programName: string = '';
  private programDesc: string = '';
  private programVer: string = '';
  private commandsList: SubCommand[] = [];

  name(name: string): this {
    this.programName = name;
    return this;
  }

  description(desc: string): this {
    this.programDesc = desc;
    return this;
  }

  version(ver: string): this {
    this.programVer = ver;
    return this;
  }

  command(cmdStr: string, options?: { isDefault?: boolean }): SubCommand {
    const isDefault = !!(options && options.isDefault);
    const sub = new SubCommand(cmdStr, isDefault);
    this.commandsList.push(sub);
    return sub;
  }

  showHelp() {
    console.log(`\nUsage: ${this.programName} [command] [options]\n`);
    if (this.programDesc) {
      console.log(`${this.programDesc}\n`);
    }
    console.log(`Options:`);
    console.log(`  -h, --help      Display help for command`);
    console.log(`  -v, --version   Output the version number\n`);
    console.log(`Commands:`);
    for (const cmd of this.commandsList) {
      const defaultStr = cmd.isDefaultCmd ? ' (default)' : '';
      console.log(`  ${cmd.nameStr.padEnd(20)} ${cmd.descStr}${defaultStr}`);
      for (const opt of cmd.optionsList) {
        console.log(`    ${opt.flags.padEnd(22)} ${opt.description}`);
      }
    }
    console.log();
  }

  async parse(argv: string[]) {
    const args = argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
      this.showHelp();
      process.exit(0);
    }

    if (args.includes('--version') || args.includes('-v')) {
      console.log(this.programVer);
      process.exit(0);
    }

    let cmdName = '';
    let commandArgs: string[] = [];

    const firstArg = args[0];
    let matchedCmd = this.commandsList.find(c => c.nameStr.split(' ')[0] === firstArg);

    if (matchedCmd) {
      cmdName = firstArg;
      commandArgs = args.slice(1);
    } else {
      matchedCmd = this.commandsList.find(c => c.isDefaultCmd);
      if (matchedCmd) {
        cmdName = matchedCmd.nameStr.split(' ')[0];
        commandArgs = args;
      } else {
        console.error(`Error: Unknown command "${firstArg}"`);
        this.showHelp();
        process.exit(1);
      }
    }

    const optionsResult: Record<string, any> = {};
    for (const opt of matchedCmd.optionsList) {
      optionsResult[opt.key] = opt.defaultValue;
    }

    const positionalArgs: string[] = [];
    let i = 0;
    while (i < commandArgs.length) {
      const arg = commandArgs[i];
      if (arg.startsWith('-')) {
        const opt = matchedCmd.optionsList.find(o => o.short === arg || o.long === arg);
        if (opt) {
          if (opt.isFlag) {
            if (opt.long && opt.long.startsWith('--no-')) {
              optionsResult[opt.key] = false;
            } else {
              optionsResult[opt.key] = true;
            }
          } else {
            const val = commandArgs[++i];
            optionsResult[opt.key] = val;
          }
        } else {
          console.error(`Error: Unknown option "${arg}"`);
          this.showHelp();
          process.exit(1);
        }
      } else {
        positionalArgs.push(arg);
      }
      i++;
    }

    if (!matchedCmd.actionFn) {
      console.error(`Error: Command "${cmdName}" has no action defined`);
      process.exit(1);
    }

    try {
      await matchedCmd.actionFn(...positionalArgs, optionsResult);
    } catch (err: any) {
      console.error(`Error executing command ${cmdName}:`, err.message);
      process.exit(1);
    }
  }
}

class Table {
  private head: string[];
  private colWidths: number[];
  private rows: string[][] = [];

  constructor(options: { head: string[]; colWidths: number[]; wordWrap?: boolean }) {
    this.head = options.head;
    this.colWidths = options.colWidths;
  }

  push(row: string[]) {
    this.rows.push(row);
  }

  toString(): string {
    const wrapCell = (text: string, width: number): string[] => {
      const colWidth = Math.max(1, width);
      const cleanText = String(text ?? '').replace(/\r?\n/g, ' ');
      const lines: string[] = [];
      let i = 0;
      while (i < cleanText.length) {
        let chunk = cleanText.substring(i, i + colWidth);
        if (chunk.length < colWidth) {
          lines.push(chunk.padEnd(colWidth));
          break;
        }
        let spaceIdx = chunk.lastIndexOf(' ');
        if (spaceIdx > 0) {
          chunk = chunk.substring(0, spaceIdx);
          lines.push(chunk.padEnd(colWidth));
          i += spaceIdx + 1;
        } else {
          lines.push(chunk);
          i += colWidth;
        }
      }
      if (lines.length === 0) {
        lines.push(''.padEnd(colWidth));
      }
      return lines;
    };

    const buildBorder = (char: string, corner: string): string => {
      return corner + this.colWidths.map(w => char.repeat(w + 2)).join(corner) + corner;
    };

    const topBorder = buildBorder('─', '┌');
    const headerSeparator = buildBorder('─', '├');
    const rowSeparator = buildBorder('─', '├');
    const bottomBorder = buildBorder('─', '└');

    const result: string[] = [];
    result.push(topBorder);

    const headerLines = this.head.map((h, i) => wrapCell(h, this.colWidths[i]));
    const maxHeaderLines = Math.max(...headerLines.map(l => l.length));
    for (let r = 0; r < maxHeaderLines; r++) {
      const rowParts = this.head.map((_, colIdx) => {
        const line = headerLines[colIdx][r] || ''.padEnd(this.colWidths[colIdx]);
        return ` ${line} `;
      });
      result.push(`│${rowParts.join('│')}│`);
    }

    result.push(headerSeparator);

    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      const cellLines = row.map((cell, colIdx) => wrapCell(cell, this.colWidths[colIdx]));
      const maxLines = Math.max(...cellLines.map(l => l.length));

      for (let r = 0; r < maxLines; r++) {
        const rowParts = row.map((_, colIdx) => {
          const line = cellLines[colIdx][r] || ''.padEnd(this.colWidths[colIdx]);
          return ` ${line} `;
        });
        result.push(`│${rowParts.join('│')}│`);
      }
      if (i < this.rows.length - 1) {
        result.push(rowSeparator);
      }
    }

    result.push(bottomBorder);
    return result.join('\n');
  }
}

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
      const table = new Table({
        head: ['Type', 'Title', 'Status', 'ID'],
        colWidths: [12, 45, 12, 30],
        wordWrap: true
      });
      for (const n of list.nodes) {
        table.push([
          n.type.toUpperCase(),
          n.title,
          n.status,
          n.id
        ]);
      }
      console.log(table.toString());
      console.log('======================================\n');
    } catch (error: any) {
      logger.error('Failed to inspect project:', error.message);
    }
  });

// Metrics command to display ROI and token savings metrics
program
  .command('metrics')
  .description('Display project graph ROI, productivity, and token savings metrics')
  .option('-p, --project <name>', 'Project slug name')
  .action((options) => {
    const projectSlug = getProjectSlug(options.project);
    logger.info(`Calculating metrics for project: ${projectSlug}`);

    try {
      const metrics = AnalyticsEngine.valueMetrics({ project: projectSlug });
      console.log('\n' + metrics.markdown_summary + '\n');
    } catch (error: any) {
      logger.error('Failed to calculate metrics:', error.message);
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

// Sessions command to list sessions
program
  .command('sessions')
  .description('List active/recent sessions in the project database')
  .option('-p, --project <name>', 'Project slug name')
  .option('--active', 'Filter by active sessions only')
  .option('--limit <n>', 'Limit the number of results returned', '20')
  .action((options) => {
    try {
      const projectSlug = getProjectSlug(options.project);
      const db = getDb(projectSlug);
      const list = SessionEngine.listSessions(db, {
        project: projectSlug,
        active_only: !!options.active,
        limit: parseInt(options.limit, 10),
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
  });

// Events command to query event log
program
  .command('events')
  .description('Query the project state transition event log')
  .option('-p, --project <name>', 'Project slug name')
  .option('--node <id>', 'Filter events by node ID')
  .option('--type <type>', 'Filter events by event type (e.g. node_created)')
  .option('--session <id>', 'Filter events by session ID')
  .option('--limit <n>', 'Limit the number of results returned', '50')
  .action((options) => {
    try {
      const projectSlug = getProjectSlug(options.project);
      const db = getDb(projectSlug);
      const list = EventEngine.getEventLog(db, {
        project: projectSlug,
        entity_id: options.node,
        event_type: options.type,
        session_id: options.session,
        limit: parseInt(options.limit, 10),
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
  });

// Export-trajectories command to export events in JSONL format
program
  .command('export-trajectories')
  .description('Export project transition event logs in JSONL format')
  .option('-p, --project <name>', 'Project slug name')
  .option('--session <id>', 'Filter events by session ID')
  .option('-o, --out <file>', 'Output file path (prints to stdout if omitted)')
  .action((options) => {
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
  });

program.parse(process.argv);
