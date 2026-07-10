import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger.js';
import {
  getInstructionsTemplate,
  INSTRUCTION_TARGETS,
  getMcpConfigCursor,
  getMcpConfigVscode,
  getGlobalRulesTemplate,
} from './templates.js';
import { registerProject, getDb } from '../engine/db.js';
import { GraphEngine } from '../engine/graph.js';
import { findGitRepos } from '../utils/git.js';
import { scanGit } from '../engine/git-scanner.js';
import { runStaticScaffolder, runTechStackScaffolder } from '../engine/scaffolder.js';

const MARKER = 'state-memory-mcp';

/**
 * Temporary migration function to clean up and rename old state-graph-mcp configuration
 * and data files to state-memory-mcp.
 * MIGRATION: remove after all projects migrated.
 */
function migrateFromOldName(root: string): void {
  try {
    // 1. Data directory rename: .state-graph-mcp/ -> .state-memory-mcp/
    const oldDir = path.join(root, '.state-graph-mcp');
    const newDir = path.join(root, '.state-memory-mcp');
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
      fs.renameSync(oldDir, newDir);
      console.log('   🔄 Migrated project data directory: .state-graph-mcp/ -> .state-memory-mcp/');
    }

    // 2. Config file rename: .state-graph-mcp.json -> .state-memory-mcp.json
    const oldConfig = path.join(root, '.state-graph-mcp.json');
    const newConfig = path.join(root, '.state-memory-mcp.json');
    if (fs.existsSync(oldConfig) && !fs.existsSync(newConfig)) {
      fs.renameSync(oldConfig, newConfig);
      console.log('   🔄 Migrated project config file: .state-graph-mcp.json -> .state-memory-mcp.json');
    }

    // 3. Ignore file rename: .state-graph-ignore -> .state-memory-ignore
    const oldIgnore = path.join(root, '.state-graph-ignore');
    const newIgnore = path.join(root, '.state-memory-ignore');
    if (fs.existsSync(oldIgnore) && !fs.existsSync(newIgnore)) {
      fs.renameSync(oldIgnore, newIgnore);
      console.log('   🔄 Migrated project ignore file: .state-graph-ignore -> .state-memory-ignore');
    }

    // 4. .gitignore: replace ".state-graph-mcp" entry with ".state-memory-mcp"
    const gitignorePath = path.join(root, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      let content = fs.readFileSync(gitignorePath, 'utf-8');
      if (content.includes('.state-graph-mcp') && !content.includes('.state-memory-mcp')) {
        content = content.replace(/\.state-graph-mcp/g, '.state-memory-mcp');
        fs.writeFileSync(gitignorePath, content, 'utf-8');
        console.log('   🔄 Updated .gitignore entry: .state-graph-mcp -> .state-memory-mcp');
      }
    }

    // 5. MCP configs — rename server key in-place in .cursor/mcp.json and .vscode/mcp.json
    const mcpFiles = [
      { path: '.cursor/mcp.json', key: 'mcpServers' },
      { path: '.vscode/mcp.json', key: 'servers' }
    ];
    for (const f of mcpFiles) {
      const filePath = path.join(root, f.path);
      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const config = JSON.parse(raw);
          if (config[f.key] && config[f.key]['state-graph-mcp']) {
            const oldServer = config[f.key]['state-graph-mcp'];
            // Update command and env vars if present
            if (oldServer.command === 'state-graph-mcp') {
              oldServer.command = 'state-memory-mcp';
            }
            if (oldServer.env && oldServer.env.STATE_GRAPH_MCP_PROJECT) {
              oldServer.env.STATE_MEMORY_MCP_PROJECT = oldServer.env.STATE_GRAPH_MCP_PROJECT;
              delete oldServer.env.STATE_GRAPH_MCP_PROJECT;
            }
            config[f.key]['state-memory-mcp'] = oldServer;
            delete config[f.key]['state-graph-mcp'];
            fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
            console.log(`   🔄 Migrated MCP config server key in ${f.path}`);
          }
        } catch (e) {
          // ignore parsing error
        }
      }
    }

    // 6. Cursor rule file rename
    const oldCursorRule = path.join(root, '.cursor/rules/state-graph-mcp.mdc');
    const newCursorRule = path.join(root, '.cursor/rules/state-memory-mcp.mdc');
    if (fs.existsSync(oldCursorRule)) {
      if (!fs.existsSync(path.dirname(newCursorRule))) {
        fs.mkdirSync(path.dirname(newCursorRule), { recursive: true });
      }
      fs.renameSync(oldCursorRule, newCursorRule);
      console.log('   🔄 Migrated Cursor rule file to .cursor/rules/state-memory-mcp.mdc');
    }

    // 7. IDE instructions files — replace "state-graph-mcp" with "state-memory-mcp"
    const targets = [
      '.gemini/instructions.md',
      '.cursor/rules/state-memory-mcp.mdc',
      '.github/copilot-instructions.md',
      '.vscode/instructions.md',
      'CLAUDE.md',
      '.windsurfrules'
    ];
    for (const t of targets) {
      const filePath = path.join(root, t);
      if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf-8');
        if (content.includes('state-graph-mcp')) {
          content = content.replace(/state-graph-mcp/g, 'state-memory-mcp');
          content = content.replace(/Workflow State Graph/g, 'Workflow State Memory');
          content = content.replace(/state-graph:\/\/\//g, 'state-memory:///');
          content = content.replace(/STATE_GRAPH_MCP_/g, 'STATE_MEMORY_MCP_');
          fs.writeFileSync(filePath, content, 'utf-8');
          console.log(`   🔄 Updated instructions in ${t}`);
        }
      }
    }

    // 8. Global user registry migration
    const homedir = os.homedir();
    const oldGlobalRegistry = path.join(homedir, '.state-graph-mcp-registry.json');
    const newGlobalRegistry = path.join(homedir, '.state-memory-mcp-registry.json');
    if (fs.existsSync(oldGlobalRegistry) && !fs.existsSync(newGlobalRegistry)) {
      fs.renameSync(oldGlobalRegistry, newGlobalRegistry);
      console.log('   🔄 Migrated global registry file');
    }

    // 9. Global home data directory migration
    const oldGlobalDir = path.join(homedir, '.state-graph-mcp');
    const newGlobalDir = path.join(homedir, '.state-memory-mcp');
    if (fs.existsSync(oldGlobalDir) && !fs.existsSync(newGlobalDir)) {
      fs.renameSync(oldGlobalDir, newGlobalDir);
      console.log('   🔄 Migrated global home data directory');
    }

    // 10. Global rules files replacement
    const globalRules = [
      path.join(homedir, '.cursorrules'),
      path.join(homedir, '.gemini/GEMINI.md')
    ];
    for (const gr of globalRules) {
      if (fs.existsSync(gr)) {
        let content = fs.readFileSync(gr, 'utf-8');
        if (content.includes('state-graph-mcp') || content.includes('state-graph:///')) {
          content = content.replace(/state-graph-mcp/g, 'state-memory-mcp');
          content = content.replace(/Workflow State Graph/g, 'Workflow State Memory');
          content = content.replace(/state-graph:\/\/\//g, 'state-memory:///');
          content = content.replace(/STATE_GRAPH_MCP_/g, 'STATE_MEMORY_MCP_');
          fs.writeFileSync(gr, content, 'utf-8');
          console.log(`   🔄 Updated global rule file: ${gr}`);
        }
      }
    }
  } catch (e: any) {
    console.warn(`   ⚠️ Warning during migration: ${e.message}`);
  }
}

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
  console.log('\n🔧 Initializing state-memory-mcp...\n');

  // MIGRATION: rename/clean up old project files
  migrateFromOldName(root);

  // Register project in global registry for global client auto-resolution
  const projectName = path.basename(root);
  const projectSlug = projectName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  registerProject(projectName, root);

  initDataDirectory(root);
  updateGitignore(root);
  scaffoldInstructions(root, projectSlug);
  scaffoldMcpConfigs(root, projectSlug);
  scaffoldGlobalRules(projectSlug);

  // Step 7 — Seed node (always, on fresh init)
  const db = getDb(projectSlug);

  const countRow = db
    .prepare('SELECT COUNT(*) as count FROM nodes WHERE project = ?')
    .get(projectSlug) as { count: number };
  if (countRow && countRow.count === 0) {
    GraphEngine.addNode({
      project: projectSlug,
      type: 'observation',
      title: `Project initialized: ${projectName}`,
      status: 'active',
      metadata: {
        source: 'scaffold',
        initialized_at: new Date().toISOString(),
      },
      tags: ['init', 'source:scaffold'],
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
        createArtifacts: options.createArtifacts ?? true,
      });
      console.log('   ✅ Git scan complete:');
      console.log(`      - Commits scanned: ${scanResult.commits_scanned}`);
      console.log(`      - Observations created: ${scanResult.new_observations}`);
      console.log(`      - Tasks created: ${scanResult.new_tasks}`);
      console.log(`      - Artifacts created: ${scanResult.new_artifacts}`);
    } else {
      console.log(
        '   ⚠️  Warning: No git repositories found under project root — skipping git scan'
      );
    }
  }

  console.log('\n✅ state-memory-mcp initialized successfully!\n');

  console.log('   For Claude Desktop, add the following to your config manually:');
  console.log('   (macOS: ~/Library/Application Support/Claude/claude_desktop_config.json)');
  console.log('   (Windows: %APPDATA%\\Claude\\claude_desktop_config.json)\n');
  console.log('   {');
  console.log('     "mcpServers": {');
  console.log('       "state-memory-mcp": {');
  console.log('         "command": "state-memory-mcp",');
  console.log('         "args": ["run"]');
  console.log('       }');
  console.log('     }');
  console.log('   }\n');
}

/**
 * Create the .state-memory-mcp/ data directory.
 */
function initDataDirectory(root: string): void {
  const dir = path.join(root, '.state-memory-mcp');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('   ✅ Created .state-memory-mcp/ directory');
  } else {
    console.log('   ⏭️  .state-memory-mcp/ directory already exists');
  }
}

/**
 * Append .state-memory-mcp to .gitignore if not already present.
 */
function updateGitignore(root: string): void {
  const gitignorePath = path.join(root, '.gitignore');
  const entry = '.state-memory-mcp';

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (content.includes(entry)) {
      console.log('   ⏭️  .gitignore already contains .state-memory-mcp');
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
function scaffoldInstructions(root: string, projectSlug: string): void {
  console.log('');
  console.log('   📝 IDE Instruction Files:');

  const instructionsText = getInstructionsTemplate(projectSlug);

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
      fs.appendFileSync(filePath, `${separator}${instructionsText}`, 'utf-8');
      console.log(`      ✅ ${target.label} (${target.path}) — appended instructions`);
    } else {
      // Create new file
      fs.writeFileSync(filePath, instructionsText, 'utf-8');
      console.log(`      ✅ ${target.label} (${target.path}) — created`);
    }
  }
}

/**
 * Create or merge MCP server config files for Cursor and VS Code.
 */
function scaffoldMcpConfigs(root: string, projectSlug: string): void {
  console.log('');
  console.log('   🔌 MCP Server Configs:');

  // Cursor: .cursor/mcp.json
  mergeMcpConfig(root, '.cursor/mcp.json', 'Cursor', getMcpConfigCursor(projectSlug), 'mcpServers');

  // VS Code: .vscode/mcp.json
  mergeMcpConfig(root, '.vscode/mcp.json', 'VS Code', getMcpConfigVscode(projectSlug), 'servers');
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
  serversKey: string
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

      // Check if state-memory-mcp is already configured
      if (existing[serversKey]?.['state-memory-mcp']) {
        console.log(`      ⏭️  ${label} (${relativePath}) — already configured`);
        return;
      }

      // Merge: add state-memory-mcp to existing servers
      if (!existing[serversKey]) {
        existing[serversKey] = {};
      }
      existing[serversKey]['state-memory-mcp'] = template[serversKey]['state-memory-mcp'];

      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
      console.log(`      ✅ ${label} (${relativePath}) — merged state-memory-mcp server`);
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
function scaffoldGlobalRules(projectSlug: string): void {
  console.log('');
  console.log('   🌎 Global User Rules:');

  const homedir = os.homedir();
  const globalTargets = [
    { path: path.join(homedir, '.cursorrules'), label: 'Global Cursor Rules (~/.cursorrules)' },
    {
      path: path.join(homedir, '.gemini/GEMINI.md'),
      label: 'Global Gemini Rules (~/.gemini/GEMINI.md)',
    },
  ];

  const globalRulesText = getGlobalRulesTemplate(projectSlug);

  for (const target of globalTargets) {
    // Only configure .gemini rules if the app directory already exists
    if (target.path.includes('.gemini') && !fs.existsSync(path.dirname(target.path))) {
      continue;
    }

    if (fs.existsSync(target.path)) {
      const content = fs.readFileSync(target.path, 'utf-8');
      if (content.includes('state-memory-mcp')) {
        console.log(`      ⏭️  ${target.label} — already configured`);
        continue;
      }
      const separator = content.endsWith('\n') ? '\n' : '\n\n';
      fs.appendFileSync(target.path, `${separator}${globalRulesText}`, 'utf-8');
      console.log(`      ✅ ${target.label} — appended rules`);
    } else {
      fs.writeFileSync(target.path, globalRulesText, 'utf-8');
      console.log(`      ✅ ${target.label} — created`);
    }
  }
}
