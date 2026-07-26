import * as fs from 'fs';
import * as path from 'path';
import { findGitRepos, getGitRepoDetails, GitRepoDetails } from '../utils/git.js';

export interface SubdirectoryMemoryDb {
  projectSlug: string;
  projectRoot: string;
  relPath: string;
  dbPath: string;
}

const CACHE_TTL_MS = 2000;
const dbCache = new Map<string, { data: SubdirectoryMemoryDb[]; timestamp: number }>();
const repoCache = new Map<string, { data: GitRepoDetails[]; timestamp: number }>();

/**
 * Discovers all sub-directory .state-memory-mcp memory databases residing under a workspace root.
 * Utilizes a 2-second in-memory TTL cache to optimize performance.
 *
 * @param projectRoot - The workspace project root directory path.
 * @param maxDepth - Maximum recursion depth for sub-directory discovery (defaults to 4).
 * @param bypassCache - Set true to force re-scanning of the disk directory structure.
 * @returns Array of SubdirectoryMemoryDb descriptors.
 */
export async function findSubdirectoryMemoryDbs(
  projectRoot: string,
  maxDepth: number = 4,
  bypassCache: boolean = false
): Promise<SubdirectoryMemoryDb[]> {
  const absoluteRoot = path.resolve(projectRoot);
  const cacheKey = `${absoluteRoot}:${maxDepth}`;
  const now = Date.now();

  if (!bypassCache) {
    const cached = dbCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  let realRoot = absoluteRoot;
  try {
    realRoot = await fs.promises.realpath(absoluteRoot);
  } catch {}

  const results: SubdirectoryMemoryDb[] = [];
  const seenPaths = new Set<string>();

  async function search(currentDir: string, depth: number) {
    if (depth > maxDepth) return;

    try {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;

        const subDir = path.join(currentDir, entry.name);

        let realSubDir = subDir;
        try {
          realSubDir = await fs.promises.realpath(subDir);
        } catch {
          continue;
        }

        const relativeReal = path.relative(realRoot, realSubDir);
        const isEscaped = relativeReal.startsWith('..') || path.isAbsolute(relativeReal);
        if (isEscaped) continue;

        const relPath = path.relative(absoluteRoot, subDir);

        const localDbDir = path.join(subDir, '.state-memory-mcp');
        let localDbExists = false;
        try {
          await fs.promises.access(localDbDir);
          localDbExists = true;
        } catch {}

        if (localDbExists && !seenPaths.has(realSubDir)) {
          const slug = entry.name
            .toLowerCase()
            .replace(/[^a-z0-9-_]/g, '-')
            .replace(/-+/g, '-');
          const graphDbPath = path.join(localDbDir, slug, 'graph.db');
          const defaultDbPath = path.join(localDbDir, 'graph.db');

          let actualDbPath = '';
          try {
            await fs.promises.access(graphDbPath);
            actualDbPath = graphDbPath;
          } catch {
            try {
              await fs.promises.access(defaultDbPath);
              actualDbPath = defaultDbPath;
            } catch {
              try {
                const subEntries = await fs.promises.readdir(localDbDir, { withFileTypes: true });
                for (const sub of subEntries) {
                  if (sub.isDirectory()) {
                    const candidate = path.join(localDbDir, sub.name, 'graph.db');
                    try {
                      await fs.promises.access(candidate);
                      actualDbPath = candidate;
                      break;
                    } catch {}
                  }
                }
              } catch {}
            }
          }

          if (actualDbPath) {
            seenPaths.add(realSubDir);
            results.push({
              projectSlug: slug,
              projectRoot: subDir,
              relPath,
              dbPath: actualDbPath,
            });
          }
        }

        await search(subDir, depth + 1);
      }
    } catch {}
  }

  await search(absoluteRoot, 1);
  dbCache.set(cacheKey, { data: results, timestamp: now });
  return results;
}

/**
 * Returns an aggregated health and structure report of all Git repositories under a project root.
 * Utilizes a 2-second in-memory TTL cache to optimize performance.
 *
 * @param projectRoot - Absolute path to root directory.
 * @param maxDepth - Recursion depth for Git repository scanning (default 4).
 * @param bypassCache - Set true to force re-scanning of Git repos.
 * @returns Array of GitRepoDetails.
 */
export async function getWorkspaceGitRepos(
  projectRoot: string,
  maxDepth: number = 4,
  bypassCache: boolean = false
): Promise<GitRepoDetails[]> {
  const rootDir = path.resolve(projectRoot);
  const cacheKey = `${rootDir}:${maxDepth}`;
  const now = Date.now();

  if (!bypassCache) {
    const cached = repoCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  // We can keep findGitRepos synchronous since it's just for CLI right now,
  // or migrate it if we want, but wrapping it here is fine.
  const repoPaths = findGitRepos(rootDir, maxDepth);
  const results = repoPaths.map((repoPath) => getGitRepoDetails(repoPath, rootDir));
  repoCache.set(cacheKey, { data: results, timestamp: now });
  return results;
}

/**
 * Clears the sub-directory and Git repository discovery caches.
 */
export function clearSubdirectoryCache(): void {
  dbCache.clear();
  repoCache.clear();
}
