import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { isGitRepo, parseConventionalCommit, getCommitLog, getFilesChanged } from '../../src/utils/git.js';

describe('Git Utilities', () => {
  const tempDir = path.resolve('./temp-git-test-repo');

  beforeAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    // Initialize git repo safely across different git versions
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    try {
      execSync('git checkout -b main', { cwd: tempDir, stdio: 'ignore' });
    } catch (e) {
      // ignore branch checkout failure if main is already default
    }
    execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'ignore' });

    // Commit 1: feat(scope): initial commit
    fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'hello', 'utf-8');
    execSync('git add .', { cwd: tempDir, stdio: 'ignore' });
    execSync('git commit -m "feat(scope): initial commit"', { cwd: tempDir, stdio: 'ignore' });

    // Commit 2: fix: resolve file2 issue
    fs.writeFileSync(path.join(tempDir, 'file2.txt'), 'world', 'utf-8');
    execSync('git add .', { cwd: tempDir, stdio: 'ignore' });
    execSync('git commit -m "fix: resolve file2 issue"', { cwd: tempDir, stdio: 'ignore' });
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should detect if a directory is a git repo', () => {
    expect(isGitRepo(tempDir)).toBe(true);
    expect(isGitRepo('/')).toBe(false);
  });

  it('should parse conventional commit messages correctly', () => {
    expect(parseConventionalCommit('feat(scope): test description')).toEqual({
      type: 'feat',
      scope: 'scope',
      subject: 'test description',
    });

    expect(parseConventionalCommit('fix!: breaking change message')).toEqual({
      type: 'fix',
      scope: undefined,
      subject: 'breaking change message',
    });

    expect(parseConventionalCommit('chore: standard message')).toEqual({
      type: 'chore',
      scope: undefined,
      subject: 'standard message',
    });

    expect(parseConventionalCommit('non-conventional commit message')).toEqual({
      subject: 'non-conventional commit message',
    });
  });

  it('should retrieve commit log', () => {
    const commits = getCommitLog(tempDir, 10);
    expect(commits.length).toBe(2);

    expect(commits[0].subject).toBe('resolve file2 issue');
    expect(commits[0].conventionalType).toBe('fix');
    expect(commits[0].conventionalScope).toBeUndefined();

    expect(commits[1].subject).toBe('initial commit');
    expect(commits[1].conventionalType).toBe('feat');
    expect(commits[1].conventionalScope).toBe('scope');
  });

  it('should get files changed in a commit', () => {
    const commits = getCommitLog(tempDir, 10);
    const newestCommit = commits[0];
    const files = getFilesChanged(newestCommit.hash, tempDir);
    expect(files).toContain('file2.txt');
  });

  it('should throw validation errors for shell command injection attempts', () => {
    expect(() => getFilesChanged('hash; rm -rf /', tempDir)).toThrow();
    expect(() => getCommitLog(tempDir, 10, 'since; rm -rf /')).toThrow();
  });
});
