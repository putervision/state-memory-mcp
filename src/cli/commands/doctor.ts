import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { resolveProjectRoot, getProjectSlug, getDbPath, getDb } from '../../engine/db.js';
import { auditProjectDb } from '../../engine/audit.js';
import { VERSION } from '../../utils/version.js';

export async function doctorAction(options: { project?: string }): Promise<void> {
  console.log(`🩺 Running state-memory-mcp v${VERSION} environment health check...\n`);
  let passCount = 0;
  let totalCount = 0;

  function reportCheck(label: string, passed: boolean, details: string) {
    totalCount++;
    if (passed) {
      passCount++;
      console.log(`  ✅ ${label}: ${details}`);
    } else {
      console.log(`  ❌ ${label}: ${details}`);
    }
  }

  // 1. Node.js Version Check
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  reportCheck(
    'Node.js Runtime',
    nodeMajor >= 18,
    `${nodeVersion} (${nodeMajor >= 18 ? 'Supported' : 'Node 18+ required'})`
  );

  // 2. SQLite Native Driver & FTS5 Support
  let sqliteOk = false;
  let fts5Ok = false;
  try {
    const Database = (await import('better-sqlite3')).default;
    const testDb = new Database(':memory:');
    const result = testDb.prepare('SELECT 1 + 1 AS result').get() as { result: number };
    sqliteOk = result?.result === 2;

    try {
      testDb.exec('CREATE VIRTUAL TABLE temp_fts USING fts5(content);');
      fts5Ok = true;
    } catch {
      fts5Ok = false;
    }
    testDb.close();
  } catch {
    sqliteOk = false;
    fts5Ok = false;
  }
  reportCheck(
    'Better-SQLite3 Native Engine',
    sqliteOk,
    sqliteOk ? 'Loaded native C++ SQLite bindings successfully' : 'Failed to initialize better-sqlite3 native driver'
  );
  reportCheck(
    'FTS5 Full-Text Search Module',
    fts5Ok,
    fts5Ok ? 'FTS5 extension module enabled' : 'FTS5 module unavailable in SQLite build'
  );

  // 3. Storage Directory & Permission Check
  let storageOk = false;
  let dbFilePath = '';
  try {
    const projectRoot = resolveProjectRoot();
    const projectSlug = options.project || getProjectSlug();
    dbFilePath = getDbPath(projectSlug);
    const dbDir = path.dirname(dbFilePath);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true, mode: 0o700 });
    }
    fs.accessSync(dbDir, fs.constants.W_OK);
    storageOk = true;

    // Check directory mode permissions if stats available
    const stats = fs.statSync(dbDir);
    const mode = stats.mode & 0o777;
    reportCheck(
      'Storage Directory & Permissions',
      storageOk,
      `Writable directory at ${dbDir} (mode: 0${mode.toString(8)})`
    );
  } catch (err: any) {
    reportCheck(
      'Storage Directory & Permissions',
      false,
      `Storage error: ${err.message}`
    );
  }

  // 4. Git Repository & Branch Integration
  let gitOk = false;
  let activeBranch = 'main';
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (branch) {
      gitOk = true;
      activeBranch = branch;
    }
  } catch {
    gitOk = false;
  }
  reportCheck(
    'Git Repository Integration',
    gitOk,
    gitOk ? `Detected active repository (branch: ${activeBranch})` : 'Git repository not detected (will fallback to default project branch)'
  );

  // 5. MCP Client Config & Customization Scaffolding
  let configCount = 0;
  try {
    const homeDir = os.homedir();
    const projectRoot = resolveProjectRoot();
    const candidatePaths = [
      path.join(homeDir, '.gemini', 'config', 'mcp_config.json'),
      path.join(projectRoot, '.cursor', 'mcp.json'),
      path.join(projectRoot, '.vscode', 'mcp.json'),
      path.join(projectRoot, '.claude', 'mcp.json'),
      path.join(projectRoot, '.windsurf', 'mcp.json'),
      path.join(projectRoot, '.agents', 'AGENTS.md'),
      path.join(projectRoot, '.agents', 'skills', 'state-memory-mcp', 'SKILL.md')
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        configCount++;
      }
    }
  } catch {}
  reportCheck(
    'Client Config & Agent Scaffolding',
    configCount > 0,
    configCount > 0 ? `Detected ${configCount} scaffolded MCP client config(s) or agent skill rule(s)` : 'No MCP configs or agent rules detected (run "state-memory-mcp init" to scaffold)'
  );

  // 6. Project Graph Integrity & Cycle Audit
  try {
    const projectSlug = options.project || getProjectSlug();
    const db = getDb(projectSlug);
    if (db) {
      const audit = auditProjectDb({ project: projectSlug });
      const isClean = audit.cycles.length === 0;
      reportCheck(
        'Database Integrity & Graph Cycles',
        isClean,
        isClean ? `Clean graph integrity for project "${projectSlug}" (0 circular dependencies)` : `Detected ${audit.cycles.length} circular dependency cycle(s) in project "${projectSlug}"`
      );
    }
  } catch (err: any) {
    reportCheck(
      'Database Integrity & Graph Cycles',
      false,
      `Could not audit database: ${err.message}`
    );
  }

  console.log(`\n📋 Health Check Summary: ${passCount}/${totalCount} checks passed.`);
  if (passCount < totalCount) {
    console.log('⚠️  Some environment or database checks failed. Run "state-memory-mcp init" or check the warnings above.');
  } else {
    console.log('🎉 System is healthy and ready to run state-memory-mcp.');
  }
}
