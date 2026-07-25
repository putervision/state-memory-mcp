import Database from 'better-sqlite3';
import { resolveProjectRoot, getProjectSlug, getDb } from '../../engine/db.js';
import { getWorkspaceGitRepos, findSubdirectoryMemoryDbs } from '../../engine/subdirectory-scanner.js';

export async function subprojectsAction(options: { project?: string }): Promise<void> {
  const projectRoot = resolveProjectRoot(options.project);
  const rootSlug = getProjectSlug(options.project);

  console.log(`\n📂 Workspace Structure & Repository Discovery for "${rootSlug}":\n`);

  // 1. Git Repositories
  const gitRepos = await getWorkspaceGitRepos(projectRoot, 4);
  console.log(`🐙 Git Repositories (${gitRepos.length} detected):`);
  if (gitRepos.length === 0) {
    console.log('  (No Git repositories detected)');
  } else {
    for (const repo of gitRepos) {
      const isRoot = repo.relPath === '.';
      const label = isRoot ? `Root Workspace (${repo.repoPath})` : repo.relPath;
      const cleanBadge = repo.isClean ? '✅ clean' : '⚠️ modified';
      console.log(`  • [${label}] -> Branch: ${repo.branch || 'detached'} (${cleanBadge})`);
    }
  }

  // 2. Memory Databases
  console.log(`\n🧠 Memory Databases:`);
  const rootDb = getDb(rootSlug);
  let rootNodeCount = 0;
  try {
    const row = rootDb.prepare('SELECT COUNT(*) as cnt FROM nodes').get() as any;
    rootNodeCount = row ? row.cnt : 0;
  } catch {}
  console.log(`  • Root Project DB: "${rootSlug}" (${rootNodeCount} nodes)`);

  const subDbs = await findSubdirectoryMemoryDbs(projectRoot);
  if (subDbs.length > 0) {
    for (const subDb of subDbs) {
      let nodeCount = 0;
      try {
        const conn = new Database(subDb.dbPath, { readonly: true });
        const row = conn.prepare('SELECT COUNT(*) as cnt FROM nodes').get() as any;
        nodeCount = row ? row.cnt : 0;
        conn.close();
      } catch {}
      console.log(`  • Sub-Directory DB: "${subDb.relPath}" (slug: ${subDb.projectSlug}, ${nodeCount} nodes)`);
    }
  } else {
    console.log('  (No nested sub-directory memory databases detected)');
  }

  console.log('\n💡 Tip: Query tools like list_nodes and search_nodes observe all sub-directory memory databases automatically.\n');
}
