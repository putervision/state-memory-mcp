import { describe, it, expect } from 'vitest';
import {
  shouldCreateTask,
  detectHotFiles,
  compileIgnorePatterns,
  isIgnored,
} from '../../src/engine/git-scanner.js';
import { GitCommit } from '../../src/schema/types.js';

describe('Git Scanner Extended Coverage', () => {
  it('should evaluate shouldCreateTask with custom avoid words and commit index limits', () => {
    const commit: GitCommit = {
      hash: '1234567890abcdef1234567890abcdef12345678',
      shortHash: '1234567',
      author: 'Test',
      authorEmail: 'test@example.com',
      committedAt: new Date().toISOString(),
      subject: 'Add new feature implementation',
      message: 'Add new feature implementation',
    };

    expect(shouldCreateTask(commit, 0)).toBe(true);
    expect(shouldCreateTask(commit, 10, { taskCommitLimit: 5 })).toBe(false);

    const fixCommit: GitCommit = {
      ...commit,
      message: 'Fix broken feature bug',
      subject: 'Fix broken feature bug',
    };
    expect(shouldCreateTask(fixCommit, 0)).toBe(false);

    expect(shouldCreateTask(fixCommit, 0, { taskAvoidWords: ['skipthis'] })).toBe(true);
  });

  it('should detect hot files from commit history', () => {
    const commits: GitCommit[] = [
      {
        hash: 'h1',
        shortHash: 'h1',
        author: 'A',
        authorEmail: 'a@e.com',
        committedAt: 'now',
        subject: 's1',
        message: 'm1',
        filesChanged: ['src/index.ts', 'src/db.ts'],
      },
      {
        hash: 'h2',
        shortHash: 'h2',
        author: 'A',
        authorEmail: 'a@e.com',
        committedAt: 'now',
        subject: 's2',
        message: 'm2',
        filesChanged: ['src/index.ts'],
      },
      {
        hash: 'h3',
        shortHash: 'h3',
        author: 'A',
        authorEmail: 'a@e.com',
        committedAt: 'now',
        subject: 's3',
        message: 'm3',
        filesChanged: ['src/index.ts'],
      },
    ];

    const hot = detectHotFiles(commits, 3);
    expect(hot).toEqual(['src/index.ts']);
  });

  it('should compile ignore patterns and verify isIgnored', () => {
    const regexes = compileIgnorePatterns(['dist/', '*.log', '/tmp/*']);
    expect(regexes.length).toBeGreaterThan(0);

    expect(isIgnored('dist/index.js', regexes)).toBe(true);
    expect(isIgnored('src/main.ts', regexes)).toBe(false);
  });
});
