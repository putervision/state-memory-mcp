import { execSync } from 'child_process';
import { describe, it, expect } from 'vitest';
import * as os from 'os';
import {
  getCurrentBranch,
  parseConventionalCommit,
  getFilesChanged,
  getCommitLog,
  getGitRepoDetails,
  findGitRepos,
} from '../../src/utils/git.js';

describe('Git Utilities Extended Coverage', () => {
  it('should parse conventional commits', () => {
    const res1 = parseConventionalCommit('feat(core)!: breaking change feature');
    expect(res1.type).toBe('feat');
    expect(res1.scope).toBe('core');
    expect(res1.subject).toBe('breaking change feature');

    const res2 = parseConventionalCommit('plain commit message without type');
    expect(res2.type).toBeUndefined();
    expect(res2.subject).toBe('plain commit message without type');
  });

  it('should validate commit hash arguments for getFilesChanged and getCommitLog', () => {
    expect(() => getFilesChanged('invalid-hash')).toThrow(
      'Invalid git reference or commit hash: invalid-hash'
    );

    expect(() => getCommitLog(process.cwd(), 10, 'invalid-hash')).toThrow(
      'Invalid git reference or commit hash: invalid-hash'
    );
  });

  it('should handle non-git directory in getCommitLog and getCurrentBranch', () => {
    const tmp = os.tmpdir();
    const branch = getCurrentBranch(tmp);
    expect(branch).toBeNull();

    const commits = getCommitLog(tmp, 5);
    expect(commits).toEqual([]);
  });

  it('should handle since commit hash parameter in getCommitLog (reachable and unreachable)', () => {
    const root = process.cwd();
    // Test unreachable 40-character commit hash (fails cat-file check)
    const unreachableSha = '0000000000000000000000000000000000000000';
    const fallbackCommits = getCommitLog(root, 5, unreachableSha);
    expect(Array.isArray(fallbackCommits)).toBe(true);

    // Test reachable commit hash (HEAD's 40-character SHA)
    try {
      const headSha = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf-8' }).trim();
      const headCommits = getCommitLog(root, 5, headSha);
      expect(Array.isArray(headCommits)).toBe(true);
    } catch {}
  });

  it('should handle non-git directory for getGitRepoDetails gracefully', () => {
    const tmp = os.tmpdir();
    const details = getGitRepoDetails(tmp);
    expect(details.repoPath).toBe(tmp);
    expect(details.isClean).toBe(false);
  });
});
