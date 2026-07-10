import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { closeAllDbs, getDb } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import {
  scanGit,
  commitAlreadyProcessed,
  shouldCreateTask,
  detectHotFiles,
} from '../../src/engine/git-scanner.js';
import { GitCommit } from '../../src/schema/types.js';

describe('Git Scanner Engine', () => {
  const project = 'git-scanner-test-project';
  const tempRepoDir = path.resolve('./temp-scanner-test-repo');

  beforeAll(() => {
    // Clean up test database directory to ensure fresh migration
    const dbDir = path.resolve('./.state-memory-mcp/git-scanner-test-project');
    if (fs.existsSync(dbDir)) {
      fs.rmSync(dbDir, { recursive: true, force: true });
    }

    if (fs.existsSync(tempRepoDir)) {
      fs.rmSync(tempRepoDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempRepoDir, { recursive: true });
    execSync('git init', { cwd: tempRepoDir, stdio: 'ignore' });
    try {
      execSync('git checkout -b main', { cwd: tempRepoDir, stdio: 'ignore' });
    } catch (e) {
      // ignore
    }
    execSync('git config user.name "Test User"', { cwd: tempRepoDir, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: tempRepoDir, stdio: 'ignore' });

    // Commit 1: feat: first commit
    fs.writeFileSync(path.join(tempRepoDir, 'hot.txt'), 'version 1', 'utf-8');
    fs.writeFileSync(path.join(tempRepoDir, 'cold.txt'), 'version 1', 'utf-8');
    execSync('git add .', { cwd: tempRepoDir, stdio: 'ignore' });
    execSync('git commit -m "feat: first commit"', { cwd: tempRepoDir, stdio: 'ignore' });

    // Commit 2: chore: update hot file
    fs.writeFileSync(path.join(tempRepoDir, 'hot.txt'), 'version 2', 'utf-8');
    execSync('git add .', { cwd: tempRepoDir, stdio: 'ignore' });
    execSync('git commit -m "chore: update hot file"', { cwd: tempRepoDir, stdio: 'ignore' });

    // Commit 3: fix: resolved minor issue
    fs.writeFileSync(path.join(tempRepoDir, 'hot.txt'), 'version 3', 'utf-8');
    execSync('git add .', { cwd: tempRepoDir, stdio: 'ignore' });
    execSync('git commit -m "fix: resolved minor issue"', { cwd: tempRepoDir, stdio: 'ignore' });

    // Commit 4: feat: added awesome feature
    fs.writeFileSync(path.join(tempRepoDir, 'hot.txt'), 'version 4', 'utf-8');
    execSync('git add .', { cwd: tempRepoDir, stdio: 'ignore' });
    execSync('git commit -m "feat: added awesome feature"', { cwd: tempRepoDir, stdio: 'ignore' });
  });

  afterAll(() => {
    closeAllDbs();
    if (fs.existsSync(tempRepoDir)) {
      fs.rmSync(tempRepoDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare("DELETE FROM schema_meta WHERE key LIKE 'last_git_commit%'").run();
  });

  it('should evaluate shouldCreateTask correctly', () => {
    const mockCommit = (msg: string): GitCommit => ({
      hash: 'abc',
      shortHash: 'abc',
      author: 'A',
      authorEmail: 'a@a.com',
      committedAt: '2026-07-08',
      subject: msg,
      message: msg,
    });

    expect(shouldCreateTask(mockCommit('feat: add scanner'), 0)).toBe(true);
    expect(shouldCreateTask(mockCommit('fix: resolve issue'), 0)).toBe(false);
    expect(shouldCreateTask(mockCommit('chore: complete task'), 0)).toBe(false);
    expect(shouldCreateTask(mockCommit('feat: add scanner'), 5)).toBe(false);
  });

  it('should detect hot files correctly', () => {
    const mockCommits: GitCommit[] = [
      {
        hash: '1',
        shortHash: '1',
        author: '',
        authorEmail: '',
        committedAt: '',
        subject: '',
        message: '',
        filesChanged: ['a.txt', 'b.txt'],
      },
      {
        hash: '2',
        shortHash: '2',
        author: '',
        authorEmail: '',
        committedAt: '',
        subject: '',
        message: '',
        filesChanged: ['a.txt'],
      },
      {
        hash: '3',
        shortHash: '3',
        author: '',
        authorEmail: '',
        committedAt: '',
        subject: '',
        message: '',
        filesChanged: ['a.txt', 'c.txt'],
      },
    ];

    expect(detectHotFiles(mockCommits, 2)).toContain('a.txt');
    expect(detectHotFiles(mockCommits, 2)).not.toContain('b.txt');
    expect(detectHotFiles(mockCommits, 3)).toContain('a.txt');
    expect(detectHotFiles(mockCommits, 4)).toEqual([]);
  });

  it('should scan git history and create nodes correctly', async () => {
    const result = await scanGit(project, tempRepoDir, {
      commits: 10,
      createTasks: true,
      createArtifacts: true,
    });

    expect(result.commits_scanned).toBe(4);
    expect(result.new_observations).toBe(4);
    expect(result.new_tasks).toBe(3); // Commit 1, 2, 4 (Commit 3 is a fix)
    expect(result.new_artifacts).toBe(1); // hot.txt (4 changes)

    const db = getDb(project);
    const nodes = db.prepare('SELECT * FROM nodes WHERE project = ?').all(project) as any[];
    expect(
      nodes.some((n) => n.type === 'observation' && n.title.includes('feat: added awesome feature'))
    ).toBe(true);
    expect(
      nodes.some(
        (n) => n.type === 'task' && n.title.includes('Continue work on added awesome feature')
      )
    ).toBe(true);
    expect(nodes.some((n) => n.type === 'artifact' && n.title === 'hot.txt')).toBe(true);
    expect(nodes.some((n) => n.type === 'artifact' && n.title === 'cold.txt')).toBe(false);

    const edges = db.prepare('SELECT * FROM edges WHERE project = ?').all(project) as any[];
    expect(edges.some((e) => e.type === 'extends')).toBe(true);
    expect(edges.some((e) => e.type === 'modifies')).toBe(true);
  });

  it('should decouple observation and task creation, and heal links to milestone:core:v1', async () => {
    const db = getDb(project);

    // First, run static scaffolding so milestone:core:v1 exists
    const coreMilestone = GraphEngine.addNode({
      project,
      type: 'milestone',
      title: 'Core Milestone',
      metadata: { scaffold_key: 'milestone:core:v1' },
    });

    // 1. Run git scan with createTasks = false
    const res1 = await scanGit(project, tempRepoDir, {
      commits: 10,
      createTasks: false,
      createArtifacts: false,
    });

    expect(res1.new_observations).toBe(4);
    expect(res1.new_tasks).toBe(0);

    // 2. Run git scan again with createTasks = true
    const res2 = await scanGit(project, tempRepoDir, {
      commits: 10,
      createTasks: true,
      createArtifacts: false,
    });

    // It should NOT create new observations, but should create the 3 tasks!
    expect(res2.new_observations).toBe(0);
    expect(res2.new_tasks).toBe(3);

    // Verify tasks are linked to milestone:core:v1 with 'part_of' edge
    const edges = db
      .prepare(
        `
      SELECT * FROM edges 
      WHERE project = ? AND target_id = ? AND type = 'part_of'
    `
      )
      .all(project, coreMilestone.id) as any[];

    expect(edges.length).toBe(3);
  });

  it('should be idempotent and support incremental scans', async () => {
    const res1 = await scanGit(project, tempRepoDir, {
      commits: 10,
      createTasks: true,
      createArtifacts: true,
    });
    expect(res1.commits_scanned).toBe(4);

    const res2 = await scanGit(project, tempRepoDir, {
      commits: 10,
      createTasks: true,
      createArtifacts: true,
    });
    expect(res2.commits_scanned).toBe(0);
    expect(res2.new_observations).toBe(0);

    // Make a new commit
    fs.writeFileSync(path.join(tempRepoDir, 'cold.txt'), 'version 2', 'utf-8');
    execSync('git add .', { cwd: tempRepoDir, stdio: 'ignore' });
    execSync('git commit -m "feat: secondary hot change"', { cwd: tempRepoDir, stdio: 'ignore' });

    const res3 = await scanGit(project, tempRepoDir, {
      commits: 10,
      createTasks: true,
      createArtifacts: true,
    });
    expect(res3.commits_scanned).toBe(1);
    expect(res3.new_observations).toBe(1);
    expect(res3.new_tasks).toBe(1);
  });

  describe('Recursive Sub-Repository Scanning', () => {
    const parentDir = path.resolve('./temp-scanner-parent');
    const repoADir = path.join(parentDir, 'repo-a');
    const repoBDir = path.join(parentDir, 'repo-b');

    beforeAll(() => {
      if (fs.existsSync(parentDir)) {
        fs.rmSync(parentDir, { recursive: true, force: true });
      }
      fs.mkdirSync(repoADir, { recursive: true });
      fs.mkdirSync(repoBDir, { recursive: true });

      // Init repo-a
      execSync('git init', { cwd: repoADir, stdio: 'ignore' });
      try {
        execSync('git checkout -b main', { cwd: repoADir, stdio: 'ignore' });
      } catch {}
      execSync('git config user.name "Test User"', { cwd: repoADir, stdio: 'ignore' });
      execSync('git config user.email "test@example.com"', { cwd: repoADir, stdio: 'ignore' });
      fs.writeFileSync(path.join(repoADir, 'fileA.txt'), 'hello A', 'utf-8');
      execSync('git add .', { cwd: repoADir, stdio: 'ignore' });
      execSync('git commit -m "feat: commit in repo A"', { cwd: repoADir, stdio: 'ignore' });

      // Init repo-b
      execSync('git init', { cwd: repoBDir, stdio: 'ignore' });
      try {
        execSync('git checkout -b main', { cwd: repoBDir, stdio: 'ignore' });
      } catch {}
      execSync('git config user.name "Test User"', { cwd: repoBDir, stdio: 'ignore' });
      execSync('git config user.email "test@example.com"', { cwd: repoBDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(repoBDir, 'fileB.txt'), 'hello B', 'utf-8');
      execSync('git add .', { cwd: repoBDir, stdio: 'ignore' });
      execSync('git commit -m "feat: commit in repo B"', { cwd: repoBDir, stdio: 'ignore' });
    });

    afterAll(() => {
      if (fs.existsSync(parentDir)) {
        fs.rmSync(parentDir, { recursive: true, force: true });
      }
    });

    beforeEach(() => {
      const db = getDb(project);
      db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
      db.prepare('DELETE FROM edges WHERE project = ?').run(project);
      db.prepare("DELETE FROM schema_meta WHERE key LIKE 'last_git_commit%'").run();
    });

    it('should recursively detect and scan multiple sub-repositories', async () => {
      const result = await scanGit(project, parentDir, {
        commits: 5,
        createTasks: true,
        createArtifacts: true,
      });

      expect(result.commits_scanned).toBe(2); // 1 from repo-a, 1 from repo-b
      expect(result.new_observations).toBe(2);
      expect(result.new_tasks).toBe(2);

      const db = getDb(project);
      const nodes = db.prepare('SELECT * FROM nodes WHERE project = ?').all(project) as any[];

      // Check observation node for repo-a
      const obsA = nodes.find(
        (n) =>
          n.type === 'observation' &&
          n.title.includes('repo-a') &&
          n.title.includes('commit in repo A')
      );
      expect(obsA).toBeDefined();
      const metaA = JSON.parse(obsA.metadata);
      expect(metaA.repo_path).toBe('repo-a');
      expect(metaA.files_changed).toContain('repo-a/fileA.txt');

      // Check observation node for repo-b
      const obsB = nodes.find(
        (n) =>
          n.type === 'observation' &&
          n.title.includes('repo-b') &&
          n.title.includes('commit in repo B')
      );
      expect(obsB).toBeDefined();
      const metaB = JSON.parse(obsB.metadata);
      expect(metaB.repo_path).toBe('repo-b');
      expect(metaB.files_changed).toContain('repo-b/fileB.txt');

      // Check task node for repo-a
      const taskA = nodes.find(
        (n) => n.type === 'task' && n.title.includes('Continue work on commit in repo A (repo-a)')
      );
      expect(taskA).toBeDefined();
    });
  });
});
