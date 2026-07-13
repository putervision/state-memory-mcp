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
  getMcpConfigAntigravity,
  getSkillTemplate,
  getAgentsMdTemplate,
} from './templates.js';
import { registerProject, getDb, getProjectSlug, getProjectDbDir } from '../engine/db.js';
import { GraphEngine } from '../engine/graph.js';
import { findGitRepos } from '../utils/git.js';
import { scanGit } from '../engine/git-scanner.js';
import { runStaticScaffolder, runTechStackScaffolder } from '../engine/scaffolder.js';
import { validateGraph } from '../engine/validate.js';
import { exportGraph } from '../engine/export.js';
import { EventEngine } from '../engine/events.js';

const MARKER = 'state-memory-mcp';

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
    pruneEvents?: string;
  }
): Promise<void> {
  console.log('\n🔧 Initializing state-memory-mcp...\n');

  // Register project in global registry for global client auto-resolution
  const projectName = path.basename(root);
  const projectSlug = getProjectSlug(projectName);
  registerProject(projectName, root);

  initDataDirectory(root);
  updateGitignore(root);
  scaffoldInstructions(root, projectSlug);
  scaffoldMcpConfigs(root, projectSlug);
  scaffoldGlobalRules(projectSlug);
  scaffoldGlobalAntigravityMcpConfig();
  scaffoldAgentsCustomizations(root, projectSlug);

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

  // Step 9 — Optional Event Log Pruning
  if (options?.pruneEvents) {
    console.log(`   🧹 Pruning event log history older than ${options.pruneEvents}...`);
    try {
      const pruneResult = EventEngine.pruneEvents(db, {
        project: projectSlug,
        older_than: options.pruneEvents,
        dry_run: false,
      });
      console.log(`   ✅ Pruned ${pruneResult.deleted} old events from the ledger`);
    } catch (error: any) {
      logger.warn(`Event log pruning failed: ${error.message}`);
    }
  }

  // Step 10 — Graph Validation & Health Audit
  try {
    console.log('   🔍 Auditing project graph health...');
    const validation = validateGraph(db, { project: projectSlug });
    if (validation.passed) {
      console.log('   ✅ Graph structure validation passed (no issues found)');
    } else {
      console.log(`   ⚠️  Graph validation found ${validation.issues.length} issue(s):`);
      for (const issue of validation.issues) {
        console.log(`      - [${issue.severity.toUpperCase()}] ${issue.message} (${issue.check})`);
      }
    }
  } catch (error: any) {
    logger.warn(`Graph validation failed: ${error.message}`);
  }

  // Step 11 — Auto-generate HTML Force Visualizer
  try {
    const projectDbDir = getProjectDbDir(projectSlug);
    if (!fs.existsSync(projectDbDir)) {
      fs.mkdirSync(projectDbDir, { recursive: true });
    }
    const htmlContent = exportGraph({ project: projectSlug, format: 'html' });
    const htmlPath = path.join(projectDbDir, 'viewer.html');
    fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
    console.log(`   ✅ Generated HTML visualization at: ${htmlPath}`);
  } catch (error: any) {
    logger.warn(`Could not generate graph visualizer: ${error.message}`);
  }

  console.log('\n✅ state-memory-mcp initialized successfully!\n');

  console.log('   For Claude Desktop, add the following to your config manually:');
  console.log('   (macOS: ~/Library/Application Support/Claude/claude_desktop_config.json)');
  console.log('   (Linux: ~/.config/Claude/claude_desktop_config.json)');
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
 * Merge a state-memory-mcp server entry into an existing MCP config file,
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

/**
 * Create or merge the global Google Antigravity (Gemini) MCP config.
 * Only runs if ~/.gemini/config/ directory exists.
 */
function scaffoldGlobalAntigravityMcpConfig(): void {
  const homedir = os.homedir();
  const geminiConfigDir = path.join(homedir, '.gemini', 'config');

  if (!fs.existsSync(geminiConfigDir)) {
    return; // Not an Antigravity user — skip silently
  }

  console.log('');
  console.log('   🌎 Global Antigravity MCP Config:');
  mergeMcpConfig(
    homedir,
    '.gemini/config/mcp_config.json',
    'Google Antigravity (Gemini)',
    getMcpConfigAntigravity(),
    'mcpServers'
  );
}

/**
 * Scaffold workspace-level agent customizations:
 * - .agents/AGENTS.md (concise workflow rules)
 * - .agents/skills/state-memory-mcp/SKILL.md (comprehensive skill reference)
 */
function scaffoldAgentsCustomizations(root: string, projectSlug: string): void {
  console.log('');
  console.log('   🤖 Agent Customizations (.agents/):');

  // --- .agents/AGENTS.md ---
  const agentsMdPath = path.join(root, '.agents', 'AGENTS.md');
  const agentsMdDir = path.dirname(agentsMdPath);

  if (!fs.existsSync(agentsMdDir)) {
    fs.mkdirSync(agentsMdDir, { recursive: true });
  }

  const agentsMdContent = getAgentsMdTemplate(projectSlug);

  if (fs.existsSync(agentsMdPath)) {
    const existing = fs.readFileSync(agentsMdPath, 'utf-8');
    if (existing.includes(MARKER)) {
      console.log('      ⏭️  .agents/AGENTS.md — already configured');
    } else {
      const separator = existing.endsWith('\n') ? '\n' : '\n\n';
      fs.appendFileSync(agentsMdPath, `${separator}${agentsMdContent}`, 'utf-8');
      console.log('      ✅ .agents/AGENTS.md — appended state-memory-mcp rules');
    }
  } else {
    fs.writeFileSync(agentsMdPath, agentsMdContent, 'utf-8');
    console.log('      ✅ .agents/AGENTS.md — created');
  }

  // --- .agents/skills/state-memory-mcp/SKILL.md ---
  const skillPath = path.join(root, '.agents', 'skills', 'state-memory-mcp', 'SKILL.md');
  const skillDir = path.dirname(skillPath);

  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  const skillContent = getSkillTemplate(projectSlug);

  fs.writeFileSync(skillPath, skillContent, 'utf-8');
  console.log('      ✅ .agents/skills/state-memory-mcp/SKILL.md — updated to latest version');
}

/**
 * Lightweight auto-initialization sequence executed on server start.
 * Scaffolds project files and registers the project root without scanning git.
 */
export async function runAutoInit(root: string, projectSlug: string): Promise<void> {
  const originalLog = console.log;
  // Redirect all console.log output to console.error (stderr) so that we don't
  // corrupt the stdio transport on server startup.
  console.log = (...args) => console.error(...args);

  try {
    const projectName = path.basename(root);
    registerProject(projectName, root);

    initDataDirectory(root);
    updateGitignore(root);
    scaffoldInstructions(root, projectSlug);
    scaffoldMcpConfigs(root, projectSlug);
    scaffoldGlobalRules(projectSlug);
    scaffoldGlobalAntigravityMcpConfig();
    scaffoldAgentsCustomizations(root, projectSlug);
  } finally {
    console.log = originalLog;
  }
}

