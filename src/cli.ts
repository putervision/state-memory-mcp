#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { logger } from './utils/logger.js';
import { resolveProjectRoot, getBaseDir, getProjectSlug } from './engine/db.js';
import { QueryEngine } from './engine/queries.js';
import { exportGraph, importGraph } from './engine/utils.js';

const program = new Command();

program
  .name('state-graph-mcp')
  .description('MCP server and CLI tool for state-graph-mcp')
  .version('0.1.0');

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
  .description('Initialize local state-graph-mcp directory in current workspace')
  .action(() => {
    const root = resolveProjectRoot();
    const baseDir = getBaseDir(root);
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
      logger.info(`Initialized .state-graph directory at: ${baseDir}`);
      logger.info('Please add ".state-graph" to your .gitignore file.');
    } else {
      logger.info(`.state-graph directory already exists at: ${baseDir}`);
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
    const projectSlug = getProjectSlug(options.project);
    const root = resolveProjectRoot();
    const baseDir = getBaseDir(root);
    const projectDbDir = path.join(baseDir, projectSlug);

    if (!fs.existsSync(projectDbDir)) {
      fs.mkdirSync(projectDbDir, { recursive: true });
    }

    try {
      const htmlContent = exportGraph({ project: projectSlug, format: 'html' });
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

program.parse(process.argv);
