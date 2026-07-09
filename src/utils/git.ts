import { execSync } from 'child_process';
import { logger } from './logger.js';
import { GitCommit } from '../schema/types.js';

import * as fs from 'fs';
import * as path from 'path';

export function getCurrentBranch(cwd: string = process.cwd()): string {
  if (process.env.STATE_GRAPH_MCP_DEFAULT_BRANCH) {
    return process.env.STATE_GRAPH_MCP_DEFAULT_BRANCH;
  }
  try {
    let current = path.resolve(cwd);
    while (true) {
      const configPath = path.join(current, '.state-graph-mcp.json');
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.defaultBranch === 'string') {
          return parsed.defaultBranch;
        }
      }
      if (fs.existsSync(path.join(current, '.git')) || fs.existsSync(path.join(current, '.state-graph-mcp'))) {
        break; // reached project root
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  } catch {
    // Ignore config check errors
  }
  try {
    const branch = execSync('git branch --show-current', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
    }).trim();
    if (branch) {
      return branch;
    }
  } catch (err) {
    // Gracefully handle if not a git repository or git command fails
    logger.debug('Failed to auto-detect git branch, falling back to "main".', err);
  }
  return 'main';
}

export function isGitRepo(cwd: string = process.cwd()): boolean {
  try {
    const output = execSync('git rev-parse --is-inside-work-tree', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
    }).trim();
    return output === 'true';
  } catch {
    return false;
  }
}

export function parseConventionalCommit(subject: string): { type?: string; scope?: string; subject: string } {
  const match = subject.match(/^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/);
  if (match) {
    return {
      type: match[1],
      scope: match[2] || undefined,
      subject: match[3],
    };
  }
  return {
    subject,
  };
}

export function getFilesChanged(hash: string, cwd: string = process.cwd()): string[] {
  try {
    const output = execSync(`git diff-tree --no-commit-id --name-only -r --root ${hash}`, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
    });
    return output.split('\n').map(line => line.trim()).filter(Boolean);
  } catch (err) {
    logger.debug(`Failed to get files changed for commit ${hash}:`, err);
    return [];
  }
}

export function getCommitLog(cwd: string, count: number, since?: string): GitCommit[] {
  const parseGitLogOutput = (output: string): GitCommit[] => {
    const tokens = output.split('\0');
    const commits: GitCommit[] = [];
    for (let i = 0; i + 6 < tokens.length; i += 7) {
      const hash = tokens[i].trim();
      if (!hash) continue;
      const shortHash = tokens[i + 1];
      const author = tokens[i + 2];
      const authorEmail = tokens[i + 3];
      const committedAt = tokens[i + 4];
      const subject = tokens[i + 5];
      const message = tokens[i + 6];

      const parsed = parseConventionalCommit(subject);
      commits.push({
        hash,
        shortHash,
        author,
        authorEmail,
        committedAt,
        subject: parsed.subject,
        message,
        conventionalType: parsed.type,
        conventionalScope: parsed.scope,
      });
    }
    return commits;
  };

  if (since) {
    let sinceExists = false;
    try {
      execSync(`git cat-file -e ${since}`, { cwd, stdio: 'ignore' });
      sinceExists = true;
    } catch {
      logger.debug(`Commit hash ${since} does not exist or is unreachable in git history. Falling back to last ${count} commits.`);
    }

    if (sinceExists) {
      try {
        const command = `git log -n ${count} --no-merges --format='%H%x00%h%x00%an%x00%ae%x00%aI%x00%s%x00%B%x00' ${since}..HEAD`;
        const output = execSync(command, {
          cwd,
          stdio: ['ignore', 'pipe', 'ignore'],
          encoding: 'utf-8',
        });
        return parseGitLogOutput(output);
      } catch (err) {
        logger.debug(`Failed to retrieve git log range ${since}..HEAD, falling back:`, err);
      }
    }
  }

  try {
    const command = `git log -n ${count} --no-merges --format='%H%x00%h%x00%an%x00%ae%x00%aI%x00%s%x00%B%x00'`;
    const output = execSync(command, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
    });
    return parseGitLogOutput(output);
  } catch (err) {
    logger.debug('Failed to retrieve fallback git log:', err);
    return [];
  }
}

export function findGitRepos(root: string, maxDepth: number = 2): string[] {
  const repos: string[] = [];

  function search(dir: string, depth: number) {
    if (depth > maxDepth) return;

    if (fs.existsSync(path.join(dir, '.git'))) {
      repos.push(dir);
      return;
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          search(path.join(dir, entry.name), depth + 1);
        }
      }
    } catch {
      // Ignore reading errors
    }
  }

  search(root, 0);
  return repos;
}

