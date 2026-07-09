import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger.js';
import {
  INSTRUCTIONS_TEMPLATE,
  INSTRUCTION_TARGETS,
  MCP_CONFIG_CURSOR,
  MCP_CONFIG_VSCODE,
  GLOBAL_RULES_TEMPLATE,
} from './templates.js';
import { registerProject, getDb } from '../engine/db.js';
import { GraphEngine } from '../engine/graph.js';
import { findGitRepos } from '../utils/git.js';
import { scanGit } from '../engine/git-scanner.js';
import { runStaticScaffolder, runTechStackScaffolder } from '../engine/scaffolder.js';

const MARKER = 'state-graph-mcp';

/**
 * Full init workflow — creates data dir, updates gitignore,
 * scaffolds IDE instructions and MCP configs, and seeds initial nodes.
 */
export async function runInit(
  root: string,
  options?: {
    fromGit?: boolean;
    commits?: number;
    createTasks?: boolean;
    createArtifacts?: boolean;
  }
): Promise<void> {
  console.log('\n🔧 Initializing state-graph-mcp...\n');

  // Register project in global registry for global client auto-resolution
  const projectName = path.basename(root);
  registerProject(projectName, root);

  initDataDirectory(root);
  updateGitignore(root);
  scaffoldInstructions(root);
  scaffoldMcpConfigs(root);
  scaffoldGlobalRules();

  // Step 7 — Seed node (always, on fresh init)
  const projectSlug = projectName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  const db = getDb(projectSlug);
  
  const countRow = db.prepare('SELECT COUNT(*) as count FROM nodes WHERE project = ?').get(projectSlug) as { count: number };
  if (countRow && countRow.count === 0) {
    GraphEngine.addNode({
      project: projectSlug,
      type: 'observation',
      title: `Project initialized: ${projectName}`,
      status: 'active',
      metadata: {
        source: 'scaffold',
        initialized_at: new Date().toISOString()
      },
      tags: ['init', 'source:scaffold']
    });
    console.log('   ✅ Created initial seed Observation node');
  }

  // Step 7a & 7b — Static and Tech Stack Scaffolding
  await runStaticScaffolder(projectSlug, db);
  await runTechStackScaffolder(projectSlug, db, root);

  // Step 8 — Git scan (only when fromGit is passed)
  if (options?.fromGit) {
    const repos = findGitRepos(root, 2);
    if (repos.length > 0) {
      console.log('   🔍 Scanning git history...');
      const scanResult = await scanGit(projectSlug, root, {
        commits: options.commits ?? 30,
        createTasks: options.createTasks ?? true,
        createArtifacts: options.createArtifacts ?? true
      });
      console.log('   ✅ Git scan complete:');
      console.log(`      - Commits scanned: ${scanResult.commits_scanned}`);
      console.log(`      - Observations created: ${scanResult.new_observations}`);
      console.log(`      - Tasks created: ${scanResult.new_tasks}`);
      console.log(`      - Artifacts created: ${scanResult.new_artifacts}`);
    } else {
      console.log('   ⚠️  Warning: No git repositories found under project root — skipping git scan');
    }
  }

  console.log('\n✅ state-graph-mcp initialized successfully!\n');

  console.log('   For Claude Desktop, add the following to your config manually:');
  console.log('   (macOS: ~/Library/Application Support/Claude/claude_desktop_config.json)');
  console.log('   (Windows: %APPDATA%\\Claude\\claude_desktop_config.json)\n');
  console.log('   {');
  console.log('     "mcpServers": {');
  console.log('       "state-graph-mcp": {');
  console.log('         "command": "state-graph-mcp",');
  console.log('         "args": ["run"]');
  console.log('       }');
  console.log('     }');
  console.log('   }\n');
}

/**
 * Create the .state-graph-mcp/ data directory.
 */
function initDataDirectory(root: string): void {
  const dir = path.join(root, '.state-graph-mcp');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('   ✅ Created .state-graph-mcp/ directory');
  } else {
    console.log('   ⏭️  .state-graph-mcp/ directory already exists');
  }
}

/**
 * Append .state-graph-mcp to .gitignore if not already present.
 */
function updateGitignore(root: string): void {
  const gitignorePath = path.join(root, '.gitignore');
  const entry = '.state-graph-mcp';

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (content.includes(entry)) {
      console.log('   ⏭️  .gitignore already contains .state-graph-mcp');
      return;
    }
    // Append with a newline separator
    const separator = content.endsWith('\n') ? '' : '\n';
    fs.appendFileSync(gitignorePath, `${separator}${entry}\n`, 'utf-8');
  } else {
    fs.writeFileSync(gitignorePath, `${entry}\n`, 'utf-8');
  }
  console.log('   ✅ Updated .gitignore');
}

/**
 * Create or append IDE instruction files for all supported editors/models.
 */
function scaffoldInstructions(root: string): void {
  console.log('');
  console.log('   📝 IDE Instruction Files:');

  for (const target of INSTRUCTION_TARGETS) {
    const filePath = path.join(root, target.path);
    const dir = path.dirname(filePath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes(MARKER)) {
        console.log(`      ⏭️  ${target.label} (${target.path}) — already configured`);
        continue;
      }

      if (target.standalone) {
        // Standalone files are not appended to — skip if they exist with different content
        console.log(`      ⏭️  ${target.label} (${target.path}) — file exists, skipping`);
        continue;
      }

      // Append to existing file
      const separator = content.endsWith('\n') ? '\n' : '\n\n';
      fs.appendFileSync(filePath, `${separator}${INSTRUCTIONS_TEMPLATE}`, 'utf-8');
      console.log(`      ✅ ${target.label} (${target.path}) — appended instructions`);
    } else {
      // Create new file
      fs.writeFileSync(filePath, INSTRUCTIONS_TEMPLATE, 'utf-8');
      console.log(`      ✅ ${target.label} (${target.path}) — created`);
    }
  }
}

/**
 * Create or merge MCP server config files for Cursor and VS Code.
 */
function scaffoldMcpConfigs(root: string): void {
  console.log('');
  console.log('   🔌 MCP Server Configs:');

  // Cursor: .cursor/mcp.json
  mergeMcpConfig(
    root,
    '.cursor/mcp.json',
    'Cursor',
    MCP_CONFIG_CURSOR,
    'mcpServers',
  );

  // VS Code: .vscode/mcp.json
  mergeMcpConfig(
    root,
    '.vscode/mcp.json',
    'VS Code',
    MCP_CONFIG_VSCODE,
    'servers',
  );
}

/**
 * Merge a state-graph-mcp server entry into an existing MCP config file,
 * or create the file if it doesn't exist. Preserves other server entries.
 */
function mergeMcpConfig(
  root: string,
  relativePath: string,
  label: string,
  template: Record<string, any>,
  serversKey: string,
): void {
  const filePath = path.join(root, relativePath);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const existing = JSON.parse(raw);

      // Check if state-graph-mcp is already configured
      if (existing[serversKey]?.['state-graph-mcp']) {
        console.log(`      ⏭️  ${label} (${relativePath}) — already configured`);
        return;
      }

      // Merge: add state-graph-mcp to existing servers
      if (!existing[serversKey]) {
        existing[serversKey] = {};
      }
      existing[serversKey]['state-graph-mcp'] = template[serversKey]['state-graph-mcp'];

      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
      console.log(`      ✅ ${label} (${relativePath}) — merged state-graph-mcp server`);
    } catch {
      logger.warn(`Could not parse ${relativePath}, creating new file`);
      fs.writeFileSync(filePath, JSON.stringify(template, null, 2) + '\n', 'utf-8');
      console.log(`      ✅ ${label} (${relativePath}) — created (replaced invalid JSON)`);
    }
  } else {
    fs.writeFileSync(filePath, JSON.stringify(template, null, 2) + '\n', 'utf-8');
    console.log(`      ✅ ${label} (${relativePath}) — created`);
  }
}

/**
 * Append instructions to global rules files (~/.cursorrules and ~/.gemini/GEMINI.md)
 */
function scaffoldGlobalRules(): void {
  console.log('');
  console.log('   🌎 Global User Rules:');

  const homedir = os.homedir();
  const globalTargets = [
    { path: path.join(homedir, '.cursorrules'), label: 'Global Cursor Rules (~/.cursorrules)' },
    { path: path.join(homedir, '.gemini/GEMINI.md'), label: 'Global Gemini Rules (~/.gemini/GEMINI.md)' },
  ];

  for (const target of globalTargets) {
    // Only configure .gemini rules if the app directory already exists
    if (target.path.includes('.gemini') && !fs.existsSync(path.dirname(target.path))) {
      continue;
    }

    if (fs.existsSync(target.path)) {
      const content = fs.readFileSync(target.path, 'utf-8');
      if (content.includes('state-graph-mcp')) {
        console.log(`      ⏭️  ${target.label} — already configured`);
        continue;
      }
      const separator = content.endsWith('\n') ? '\n' : '\n\n';
      fs.appendFileSync(target.path, `${separator}${GLOBAL_RULES_TEMPLATE}`, 'utf-8');
      console.log(`      ✅ ${target.label} — appended rules`);
    } else {
      fs.writeFileSync(target.path, GLOBAL_RULES_TEMPLATE, 'utf-8');
      console.log(`      ✅ ${target.label} — created`);
    }
  }
}

