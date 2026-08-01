#!/usr/bin/env node
import { logger } from './utils/logger.js';
import { resolveProjectRoot } from './engine/db.js';
import { runInit, runInitGlobal } from './cli/init.js';
import { VERSION } from './utils/version.js';
import { inspectAction } from './cli/commands/inspect.js';
import { doctorAction } from './cli/commands/doctor.js';
import { updateAction } from './cli/commands/update.js';
import { subprojectsAction } from './cli/commands/subprojects.js';
import {
  scanGitAction,
  metricsAction,
  viewAction,
  exportAction,
  importAction,
  backupAction,
  restoreAction,
  auditAction,
  mergeAction,
  sessionsAction,
  eventsAction,
  exportTrajectoriesAction
} from './cli/commands/other-actions.js';

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
  aliases: string[] = [];
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

  alias(aliasStr: string): this {
    this.aliases.push(aliasStr);
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
    console.log('Commands:');
    for (const cmd of this.commandsList) {
      const aliasMsg = cmd.aliases.length > 0 ? ` (aliases: ${cmd.aliases.join(', ')})` : '';
      console.log(`  ${cmd.nameStr.padEnd(25)} ${cmd.descStr}${aliasMsg}`);
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
    let matchedCmd = this.commandsList.find(
      c => c.nameStr.split(' ')[0] === firstArg || c.aliases.includes(firstArg)
    );

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

function parsePositiveInt(val: string, argName: string, defaultVal: number): number {
  if (val === undefined || val === null) return defaultVal;
  const num = parseInt(val, 10);
  if (isNaN(num) || num <= 0) {
    throw new Error(`Invalid value for option ${argName}: expected a positive integer, got "${val}"`);
  }
  return num;
}

const program = new Command();

program
  .name('state-memory-mcp')
  .description('MCP server and CLI tool for state-memory-mcp')
  .version(VERSION);

// Default run command to launch MCP server
program
  .command('run', { isDefault: true })
  .description('Start the MCP server (default)')
  .option('--read-only', 'Enforce read-only mode blocking graph mutations')
  .option('--audit-only', 'Enforce audit-only mode permitting only health and verification tools')
  .option('--admin', 'Enable administrative mode for privileged operations like event log pruning')
  .action(async (options) => {
    if (options.readOnly) {
      process.env.STATE_MEMORY_READ_ONLY = 'true';
    }
    if (options.auditOnly) {
      process.env.STATE_MEMORY_AUDIT_ONLY = 'true';
    }
    if (options.admin) {
      process.env.STATE_MEMORY_ADMIN_MODE = 'true';
    }
    logger.info('Starting MCP server...');
    await import('./index.js');
  });

// Init command to scaffold workspace
program
  .command('init')
  .description('Initialize state-memory-mcp in the current project (creates data directory, .gitignore, IDE instructions, MCP configs)')
  .option('--no-git', 'Skip populating graph from git commit history')
  .option('--commits <n>', 'Number of commits to analyze', '30')
  .option('--no-tasks', 'Skip creating task nodes from commits')
  .option('--no-artifacts', 'Skip creating artifact nodes from hot files')
  .option('--prune-events <duration>', 'Prune event log history older than duration (e.g. 30d, 7d), off by default')
  .action(async (options) => {
    const root = process.cwd();
    const commitsCount = parsePositiveInt(options.commits, '--commits', 30);
    await runInit(root, {
      fromGit: options.git !== false,
      commits: commitsCount,
      createTasks: options.tasks !== false,
      createArtifacts: options.artifacts !== false,
      pruneEvents: options.pruneEvents,
    });
  });

// Init-global command to re-initialize all registered projects in global index
program
  .command('init-global')
  .description('Re-initialize state-memory-mcp across all projects registered in ~/.state-memory-mcp/projects.json')
  .option('--clean-stale', 'Remove stale project registrations for paths that no longer exist on disk')
  .option('--scan <dir>', 'Scan directory for unregistered state-memory-mcp project folders and register them before init')
  .option('--no-git', 'Skip populating graph from git commit history')
  .option('--commits <n>', 'Number of commits to analyze', '30')
  .action(async (options) => {
    const commitsCount = parsePositiveInt(options.commits, '--commits', 30);
    await runInitGlobal({
      cleanStale: options.cleanStale,
      scan: options.scan,
      fromGit: options.git !== false,
      commits: commitsCount,
    });
  });

// Scan-git command to incrementally pull git commits into the graph
program
  .command('scan-git')
  .description('Incrementally scan git history into the graph')
  .option('-p, --project <name>', 'Project slug name')
  .option('--commits <n>', 'Number of commits to analyze', '30')
  .option('--task-commit-limit <n>', 'Chronological index limit of commits to create tasks from', '5')
  .option('--task-avoid-words <words>', 'Comma-separated list of words to avoid when creating tasks')
  .action(scanGitAction);

// Inspect command to display project status overview
program
  .command('inspect')
  .description('Display project graph overview in ASCII format')
  .option('-p, --project <name>', 'Project slug name')
  .option('-l, --limit <n>', 'Limit the number of nodes listed in the table', '50')
  .action(inspectAction);

// Metrics command to display ROI and token savings metrics
program
  .command('metrics')
  .description('Display project graph ROI, productivity, and token savings metrics')
  .option('-p, --project <name>', 'Project slug name')
  .action(metricsAction);

// View command to launch browser visualization
program
  .command('view')
  .description('Open interactive HTML graph visualization in default web browser')
  .option('-p, --project <name>', 'Project slug name')
  .action(viewAction);

// Export command to save graph to dot, mermaid, json, or html
program
  .command('export')
  .description('Export graph to various formats (json, dot, mermaid, html)')
  .option('-p, --project <name>', 'Project slug name')
  .option('-f, --format <type>', 'Format type: json, dot, mermaid, html', 'json')
  .option('-o, --out <file>', 'Output file path (prints to stdout if omitted)')
  .action(exportAction);

// Import command to load graph from JSON file
program
  .command('import <file>')
  .description('Import graph data from a JSON file (overwrites existing project data)')
  .option('-p, --project <name>', 'Project slug name')
  .action(importAction);

// Backup command to save database
program
  .command('backup')
  .description('Back up the project database to a SQLite file')
  .option('-p, --project <name>', 'Project slug name')
  .option('-o, --out <file>', 'Output backup file path (auto-generated if omitted)')
  .action(backupAction);

// Restore command to restore database from backup file
program
  .command('restore <file>')
  .description('Restore the project database from a SQLite backup file (destructively overwrites current database)')
  .option('-p, --project <name>', 'Project slug name')
  .action(restoreAction);

// Audit command to run integrity and cycle checks
program
  .command('audit')
  .description('Audit the project database for integrity, cycle paths, and contradictions')
  .option('-p, --project <name>', 'Project slug name')
  .action(auditAction);

// Merge command to merge an external database
program
  .command('merge <file>')
  .description('Merge an external SQLite database into the current project database')
  .option('-p, --project <name>', 'Project slug name')
  .option('--force', 'Commit the merge even if circular dependencies are introduced')
  .action(mergeAction);

// Sessions command to list sessions
program
  .command('sessions')
  .description('List active/recent sessions in the project database')
  .option('-p, --project <name>', 'Project slug name')
  .option('--active', 'Filter by active sessions only')
  .option('--limit <n>', 'Limit the number of results returned', '20')
  .action(sessionsAction);

// Events command to query event log
program
  .command('events')
  .description('Query the project state transition event log')
  .option('-p, --project <name>', 'Project slug name')
  .option('--node <id>', 'Filter events by node ID')
  .option('--type <type>', 'Filter events by event type (e.g. node_created)')
  .option('--session <id>', 'Filter events by session ID')
  .option('--limit <n>', 'Limit the number of results returned', '50')
  .action(eventsAction);

// Export-trajectories command to export events in JSONL format
program
  .command('export-trajectories')
  .description('Export project transition event logs in JSONL format')
  .option('-p, --project <name>', 'Project slug name')
  .option('--session <id>', 'Filter events by session ID')
  .option('-o, --out <file>', 'Output file path (prints to stdout if omitted)')
  .action(exportTrajectoriesAction);

// Doctor command to run environment and health checks
program
  .command('doctor')
  .description('Run environment health checks (Node, SQLite, FTS5, storage permissions, git, graph integrity)')
  .option('-p, --project <name>', 'Project slug name')
  .action(doctorAction);

// Update command to update global npm package
program
  .command('update')
  .alias('upgrade')
  .description('Check npm registry and update @putervision/state-memory-mcp globally to the latest version')
  .action(updateAction);

// Subprojects command to explore workspace structure and repositories
program
  .command('subprojects')
  .alias('repos')
  .description('List all Git repositories and sub-directory memory databases in the workspace')
  .option('-p, --project <name>', 'Project slug name')
  .action(subprojectsAction);

// Spec-Driven Development (SDD) commands
program
  .command('spec:ingest <file>')
  .description('Ingest a Markdown PRD, OpenSpec, or Gherkin BDD specification file into graph memory')
  .option('-p, --project <name>', 'Project slug name')
  .option('-f, --format <format>', 'Format: markdown, gherkin, auto', 'auto')
  .action((file: string, options: any) => {
    const { getDb, getProjectSlug } = require('./engine/db.js');
    const { ingestSpecFile } = require('./engine/spec-parser.js');
    const projectSlug = getProjectSlug(options.project);
    const db = getDb(projectSlug);
    const res = ingestSpecFile(db, { filePath: file, format: options.format, project: projectSlug });
    console.log(`Successfully ingested spec "${file}": ${res.requirements_count} requirements, ${res.criteria_count} criteria.`);
  });

program
  .command('spec:export <specId>')
  .description('Export a graph-managed spec node and requirements back to clean Markdown or Gherkin text')
  .option('-p, --project <name>', 'Project slug name')
  .option('-f, --format <format>', 'Export format: markdown, gherkin', 'markdown')
  .action((specId: string, options: any) => {
    const { getDb, getProjectSlug } = require('./engine/db.js');
    const { exportSpecToFile } = require('./engine/spec-parser.js');
    const projectSlug = getProjectSlug(options.project);
    const db = getDb(projectSlug);
    const out = exportSpecToFile(db, { specId, format: options.format, project: projectSlug });
    console.log(out);
  });

program
  .command('spec:matrix')
  .alias('spec:coverage')
  .description('Calculate real-time Spec Compliance matrix and requirement coverage ratio')
  .option('-p, --project <name>', 'Project slug name')
  .action((options: any) => {
    const { getDb, getProjectSlug } = require('./engine/db.js');
    const { calculateSpecCompliance } = require('./engine/spec-compliance.js');
    const projectSlug = getProjectSlug(options.project);
    const db = getDb(projectSlug);
    const report = calculateSpecCompliance(db, projectSlug);
    console.log(JSON.stringify(report, null, 2));
  });

program.parse(process.argv);

