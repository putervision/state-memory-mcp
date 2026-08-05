import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { resolveProjectRoot, getProjectSlug, getDbPath, getDb, getRegistry } from '../../engine/db.js';
import { auditProjectDb } from '../../engine/audit.js';
import { getWorkspaceGitRepos, findSubdirectoryMemoryDbs } from '../../engine/subdirectory-scanner.js';
import { VERSION } from '../../utils/version.js';

export async function doctorGlobalAction(options: { cleanStale?: boolean } = {}): Promise<void> {
  console.log(`🩺 Running state-memory-mcp v${VERSION} global multi-project health audit...\n`);
  const registry = getRegistry();
  const projectEntries = Object.entries(registry);

  if (projectEntries.length === 0) {
    console.log('📂 No registered projects found in ~/.state-memory-mcp/projects.json.');
    console.log('💡 Tip: Run "state-memory-mcp init" inside a project directory to register it.\n');
    return;
  }

  console.log(`Discovered ${projectEntries.length} registered project(s):\n`);

  let healthyProjects = 0;
  let missingProjects = 0;
  let projectWarnings = 0;

  const results: Array<{
    slug: string;
    root: string;
    status: string;
    nodes: number;
    edges: number;
    blockers: number;
    details: string;
  }> = [];

  for (const [slug, rootPath] of projectEntries) {
    const exists = fs.existsSync(rootPath);
    if (!exists) {
      missingProjects++;
      results.push({
        slug,
        root: rootPath,
        status: '❌ Missing Path',
        nodes: 0,
        edges: 0,
        blockers: 0,
        details: 'Project path does not exist on disk',
      });
      continue;
    }

    try {
      const db = getDb(slug);
      const audit = await auditProjectDb({ project: slug, includeSubdirectories: true });
      const hasCycles = audit.cycles.length > 0;

      const nodesRow = db.prepare('SELECT COUNT(*) as count FROM nodes').get() as { count: number };
      const edgesRow = db.prepare('SELECT COUNT(*) as count FROM edges').get() as { count: number };
      const blockersRow = db.prepare("SELECT COUNT(*) as count FROM nodes WHERE type = 'blocker' AND status != 'done'").get() as { count: number };

      const nodeCount = nodesRow?.count || 0;
      const edgeCount = edgesRow?.count || 0;
      const blockerCount = blockersRow?.count || 0;

      if (hasCycles) {
        projectWarnings++;
        results.push({
          slug,
          root: rootPath,
          status: '⚠️ Graph Cycle',
          nodes: nodeCount,
          edges: edgeCount,
          blockers: blockerCount,
          details: `${audit.cycles.length} circular dependency cycle(s) detected`,
        });
      } else {
        healthyProjects++;
        results.push({
          slug,
          root: rootPath,
          status: '✅ Healthy',
          nodes: nodeCount,
          edges: edgeCount,
          blockers: blockerCount,
          details: 'DB integrity clean',
        });
      }
    } catch (err: any) {
      projectWarnings++;
      results.push({
        slug,
        root: rootPath,
        status: '❌ DB Error',
        nodes: 0,
        edges: 0,
        blockers: 0,
        details: err.message,
      });
    }
  }

  for (const res of results) {
    console.log(`• [${res.slug}] (${res.status})`);
    console.log(`  Path: ${res.root}`);
    console.log(`  Stats: ${res.nodes} nodes, ${res.edges} edges, ${res.blockers} active blockers`);
    console.log(`  Notes: ${res.details}\n`);
  }

  console.log(`📊 Global Audit Summary: ${healthyProjects}/${projectEntries.length} projects healthy (${missingProjects} missing, ${projectWarnings} with warnings).`);
}

export async function doctorAction(options: { project?: string; global?: boolean; cleanStale?: boolean } = {}): Promise<void> {
  if (options.global) {
    return doctorGlobalAction(options);
  }

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
    const projectRoot = resolveProjectRoot(options.project);
    const projectSlug = options.project || getProjectSlug(options.project);
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

  // 4. Git Repository & Sub-Directory Integration
  try {
    const projectRoot = resolveProjectRoot(options.project);
    const repoInfos = await getWorkspaceGitRepos(projectRoot, 4);
    if (repoInfos.length > 0) {
      const mainRepo = repoInfos.find((r) => r.relPath === '.') || repoInfos[0];
      const subRepos = repoInfos.filter((r) => r.relPath !== '.');

      let details = `Detected active root repository (branch: ${mainRepo.branch || 'unknown'})`;
      if (subRepos.length > 0) {
        details += ` + ${subRepos.length} sub-directory git repo(s):\n` +
          subRepos.map((r) => `       • [${r.relPath}] -> branch: ${r.branch || 'detached'} (${r.isClean ? 'clean' : 'modified'})`).join('\n');
      }

      reportCheck('Git Repository Integration', true, details);
    } else {
      reportCheck(
        'Git Repository Integration',
        false,
        'Git repository not detected (will fallback to default project branch)'
      );
    }
  } catch {
    reportCheck(
      'Git Repository Integration',
      false,
      'Git repository check failed'
    );
  }

  // 5. MCP Client Config & Customization Scaffolding
  let configCount = 0;
  try {
    const homeDir = os.homedir();
    const projectRoot = resolveProjectRoot(options.project);
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

  // 6. Project Graph Integrity & Sub-Directory Cycle Audit
  try {
    const projectRoot = resolveProjectRoot(options.project);
    const projectSlug = options.project || getProjectSlug();
    const db = getDb(projectSlug);
    if (db) {
      const audit = await auditProjectDb({ project: projectSlug, includeSubdirectories: true });
      const isClean = audit.cycles.length === 0;
      const subDbs = await findSubdirectoryMemoryDbs(projectRoot);

      let subDbMsg = '';
      if (subDbs.length > 0) {
        subDbMsg = ` + ${subDbs.length} sub-directory memory DB(s) audited:\n` +
          subDbs.map((d) => `       • [${d.relPath}] -> slug: "${d.projectSlug}"`).join('\n');
      }

      reportCheck(
        'Database Integrity & Graph Cycles',
        isClean,
        isClean ? `Clean graph integrity for project "${projectSlug}"${subDbMsg} (0 circular dependencies)` : `Detected ${audit.cycles.length} circular dependency cycle(s) in project "${projectSlug}"`
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
