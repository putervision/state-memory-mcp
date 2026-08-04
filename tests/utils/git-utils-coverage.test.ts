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

  it('should get git repo details and find nested git repos', () => {
    const root = process.cwd();
    const details = getGitRepoDetails(root);
    expect(details.repoPath).toBe(root);
    expect(details.branch).toBeDefined();

    const repos = findGitRepos(root, 2);
    expect(repos.length).toBeGreaterThan(0);
  });
});
