import { Database } from 'better-sqlite3';
import * as path from 'path';
import { BaseNode, GitCommit, GitScanOptions, GitScanResult } from '../schema/types.js';
import { getDb, getProjectSlug, getMetaValue, setMetaValue } from './db.js';
import { getCurrentBranch, getCommitLog, getFilesChanged, findGitRepos } from '../utils/git.js';
import { GraphEngine } from './graph.js';
import { EdgeEngine } from './edges.js';
import { logger } from '../utils/logger.js';

export function commitAlreadyProcessed(db: any, project: string, hash: string): boolean {
  const row = db.prepare(`
    SELECT 1 FROM nodes 
    WHERE project = ? AND json_extract(metadata, '$.commit_hash') = ?
  `).get(project, hash);
  return !!row;
}

export function shouldCreateTask(commit: GitCommit, index: number): boolean {
  if (index >= 5) return false;
  const avoidWords = /\b(fix|complete|finish|done|close)\b/i;
  return !avoidWords.test(commit.message);
}

export function detectHotFiles(commits: GitCommit[], threshold = 3): string[] {
  const counts = new Map<string, number>();
  for (const commit of commits) {
    if (commit.filesChanged) {
      for (const file of commit.filesChanged) {
        counts.set(file, (counts.get(file) || 0) + 1);
      }
    }
  }
  const hotFiles: string[] = [];
  for (const [file, count] of counts.entries()) {
    if (count >= threshold) {
      hotFiles.push(file);
    }
  }
  return hotFiles;
}

export function linkExistingNodes(db: any, projectSlug: string): void {
  // 1. Get all observations, tasks, and artifacts
  const nodes = db.prepare(`
    SELECT id, type, title, metadata FROM nodes 
    WHERE project = ? AND type IN ('observation', 'task', 'artifact')
  `).all(projectSlug) as any[];

  // Map nodes for fast lookup
  const observationsByHash = new Map<string, any>();
  const artifactsByPath = new Map<string, any>();
  const tasksByHash = new Map<string, any>();

  for (const node of nodes) {
    let meta: any = {};
    try {
      meta = JSON.parse(node.metadata);
    } catch {}

    if (node.type === 'observation' && meta.commit_hash) {
      observationsByHash.set(meta.commit_hash, node);
    } else if (node.type === 'artifact') {
      const filePath = meta.file_path || node.title;
      if (filePath) {
        artifactsByPath.set(filePath, node);
      }
    } else if (node.type === 'task' && meta.commit_hash) {
      tasksByHash.set(meta.commit_hash, node);
    }
  }

  // 2. Link Tasks to Observations (extends)
  for (const [hash, taskNode] of tasksByHash.entries()) {
    const obsNode = observationsByHash.get(hash);
    if (obsNode) {
      // Check if edge already exists
      const edgeExists = db.prepare(`
        SELECT 1 FROM edges 
        WHERE project = ? AND source_id = ? AND target_id = ? AND type = 'extends'
      `).get(projectSlug, taskNode.id, obsNode.id);

      if (!edgeExists) {
        EdgeEngine.addEdge({
          project: projectSlug,
          source_id: taskNode.id,
          target_id: obsNode.id,
          type: 'extends'
        });
      }
    }
  }

  // 3. Link Observations to Artifacts (modifies)
  for (const [hash, obsNode] of observationsByHash.entries()) {
    let meta: any = {};
    try {
      meta = JSON.parse(obsNode.metadata);
    } catch {}

    if (meta.files_changed && Array.isArray(meta.files_changed)) {
      for (const file of meta.files_changed) {
        const artNode = artifactsByPath.get(file);
        if (artNode) {
          // Check if edge already exists
          const edgeExists = db.prepare(`
            SELECT 1 FROM edges 
            WHERE project = ? AND source_id = ? AND target_id = ? AND type = 'modifies'
          `).get(projectSlug, obsNode.id, artNode.id);

          if (!edgeExists) {
            EdgeEngine.addEdge({
              project: projectSlug,
              source_id: obsNode.id,
              target_id: artNode.id,
              type: 'modifies'
            });
          }
        }
      }
    }
  }

  // 4. Link Git-derived Tasks to milestone:core:v1 (part_of)
  const coreMilestone = db.prepare(`
    SELECT id FROM nodes
    WHERE project = ? AND type = 'milestone' AND json_extract(metadata, '$.scaffold_key') = 'milestone:core:v1'
  `).get(projectSlug) as { id: string } | undefined;

  if (coreMilestone) {
    for (const taskNode of tasksByHash.values()) {
      let meta: any = {};
      try {
        meta = JSON.parse(taskNode.metadata);
      } catch {}

      if (meta.source === 'git') {
        const edgeExists = db.prepare(`
          SELECT 1 FROM edges
          WHERE project = ? AND source_id = ? AND target_id = ? AND type = 'part_of'
        `).get(projectSlug, taskNode.id, coreMilestone.id);

        if (!edgeExists) {
          try {
            EdgeEngine.addEdge({
              project: projectSlug,
              source_id: taskNode.id,
              target_id: coreMilestone.id,
              type: 'part_of'
            });
          } catch (err: any) {
            logger.error(`Failed to link Git task ${taskNode.id} to core milestone: ${err.message}`);
          }
        }
      }
    }
  }
}

export async function scanGit(
  project: string,
  cwd: string,
  options: GitScanOptions
): Promise<GitScanResult> {
  const projectSlug = getProjectSlug(project);
  const db = getDb(projectSlug);

  try {
    const repoPaths = findGitRepos(cwd, 2);
    if (repoPaths.length === 0) {
      logger.info(`No git repositories found under path: ${cwd}`);
      return {
        commits_scanned: 0,
        new_observations: 0,
        new_tasks: 0,
        new_artifacts: 0,
        last_processed_commit: null,
      };
    }

    let totalCommitsScanned = 0;
    let newObsCount = 0;
    let newTasksCount = 0;
    let newArtifactsCount = 0;
    let lastProcessedHash: string | null = null;

    for (const repoPath of repoPaths) {
      const relPath = path.relative(cwd, repoPath) || '.';
      const metaKey = `last_git_commit:${relPath}`;
      let lastHash = getMetaValue(db, metaKey);

      // Backward compatibility for root repo
      if (!lastHash && relPath === '.') {
        lastHash = getMetaValue(db, 'last_git_commit');
      }

      const commits = getCommitLog(repoPath, options.commits, lastHash || undefined);
      const last5Commits = getCommitLog(repoPath, 5);

      if (commits.length === 0 && !options.createTasks) {
        continue;
      }

      // Merge commits: ensure the 5 newest commits are at the beginning
      const mergedCommits = [...last5Commits];
      const seenHashes = new Set(last5Commits.map(c => c.hash));
      for (const commit of commits) {
        if (!seenHashes.has(commit.hash)) {
          mergedCommits.push(commit);
        }
      }

      // Fetch files changed for each commit to build file stats
      for (const commit of mergedCommits) {
        const repoFiles = getFilesChanged(commit.hash, repoPath);
        // Prepend relPath to changed files to get workspace-relative path
        commit.filesChanged = relPath === '.'
          ? repoFiles
          : repoFiles.map(f => path.join(relPath, f));
      }

      for (let index = 0; index < mergedCommits.length; index++) {
        const commit = mergedCommits[index];

        // 1. Process/Ensure Observation Node
        const obsExists = db.prepare(`
          SELECT 1 FROM nodes
          WHERE project = ? AND type = 'observation' AND json_extract(metadata, '$.commit_hash') = ?
        `).get(projectSlug, commit.hash);

        if (!obsExists) {
          const typeTag = commit.conventionalType || 'other';
          const repoContext = relPath === '.' ? '' : ` [${relPath}]`;
          const obsTitle = `${typeTag}:${repoContext} ${commit.subject} (${commit.shortHash})`;
          const obsTags = ['git', 'source:git'];
          if (commit.conventionalType) {
            obsTags.push(commit.conventionalType);
          }
          if (relPath !== '.') {
            obsTags.push(`repo:${relPath}`);
          }

          GraphEngine.addNode({
            project: projectSlug,
            type: 'observation',
            title: obsTitle,
            status: 'active',
            metadata: {
              commit_hash: commit.hash,
              commit_short: commit.shortHash,
              author: commit.author,
              author_email: commit.authorEmail,
              committed_at: commit.committedAt,
              message: commit.message,
              files_changed: commit.filesChanged,
              repo_path: relPath,
            },
            tags: obsTags,
          });
          newObsCount++;
        }

        // 2. Process/Ensure Task Node (even if commit Observation already existed)
        if (options.createTasks && shouldCreateTask(commit, index)) {
          const taskExists = db.prepare(`
            SELECT 1 FROM nodes
            WHERE project = ? AND type = 'task' AND json_extract(metadata, '$.commit_hash') = ?
          `).get(projectSlug, commit.hash);

          if (!taskExists) {
            const taskTitle = relPath === '.'
              ? `Continue work on ${commit.subject}`
              : `Continue work on ${commit.subject} (${relPath})`;

            GraphEngine.addNode({
              project: projectSlug,
              type: 'task',
              title: taskTitle,
              status: 'pending',
              metadata: {
                commit_hash: commit.hash,
                source: 'git',
                repo_path: relPath,
              },
              tags: ['git', 'source:git'],
            });
            newTasksCount++;
          }
        }
      }

      // Create Artifacts for hot files if requested
      if (options.createArtifacts) {
        const hotFiles = detectHotFiles(mergedCommits, 3);
        for (const file of hotFiles) {
          const exists = db.prepare(`
            SELECT 1 FROM nodes
            WHERE project = ? AND type = 'artifact' AND title = ?
          `).get(projectSlug, file);

          if (!exists) {
            GraphEngine.addNode({
              project: projectSlug,
              type: 'artifact',
              title: file,
              status: 'current',
              metadata: {
                file_path: file,
                source: 'git',
                repo_path: relPath,
              },
              tags: ['git', 'source:git', 'hot-file'],
            });
            newArtifactsCount++;
          }
        }
      }

      // Save the latest commit hash for this repo if new commits were actually found
      if (commits.length > 0) {
        const newestHash = commits[0].hash;
        setMetaValue(db, metaKey, newestHash);
        if (relPath === '.') {
          setMetaValue(db, 'last_git_commit', newestHash);
        }
        totalCommitsScanned += commits.length;
        lastProcessedHash = newestHash;
      }
    }

    // Retroactively and proactively link all nodes (backward compatible)
    linkExistingNodes(db, projectSlug);

    return {
      commits_scanned: totalCommitsScanned,
      new_observations: newObsCount,
      new_tasks: newTasksCount,
      new_artifacts: newArtifactsCount,
      last_processed_commit: lastProcessedHash,
    };
  } catch (err: any) {
    logger.warn(`Git scan failed, continuing without git data: ${err.message}`, err);
    return {
      commits_scanned: 0,
      new_observations: 0,
      new_tasks: 0,
      new_artifacts: 0,
      last_processed_commit: null,
    };
  }
}
