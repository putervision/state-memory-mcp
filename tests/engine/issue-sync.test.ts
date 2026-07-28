import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exportIssues, importIssues } from '../../src/engine/issue-sync.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { getDb, closeDb } from '../../src/engine/db.js';

describe('Bidirectional Issue Tracker Sync Engine', () => {
  const project = 'issue-sync-test-project';

  beforeEach(() => {
    closeDb(project);
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  afterEach(() => {
    closeDb(project);
  });

  it('should import external issues into state graph memory', () => {
    const res = importIssues({
      project,
      issues: [
        {
          external_id: 'GH-101',
          title: 'Fix JWT Expiry Defect',
          body: 'Tokens expire too quickly',
          state: 'open',
          labels: ['bug', 'security'],
        },
        {
          external_id: 'GH-102',
          title: 'Update README',
          body: 'Add installation guide',
          state: 'closed',
          labels: ['docs'],
        },
      ],
    });

    expect(res.imported_count).toBe(2);
    expect(res.tasks.length).toBe(2);

    const task1 = res.tasks.find((t) => t.title === 'Fix JWT Expiry Defect');
    expect(task1).toBeDefined();
    expect(task1?.status).toBe('pending');
    expect(task1?.metadata.external_issue_id).toBe('GH-101');

    const task2 = res.tasks.find((t) => t.title === 'Update README');
    expect(task2).toBeDefined();
    expect(task2?.status).toBe('done');
  });

  it('should export tasks and blockers into GitHub Issue payloads', () => {
    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Task to Export',
      status: 'pending',
      metadata: { description: 'Task description text', external_issue_id: 'GH-101' },
      tags: ['enhancement'],
    });

    const exp = exportIssues({ project, format: 'github' });

    expect(exp.format).toBe('github');
    expect(exp.issues.length).toBe(1);
    expect(exp.issues[0].title).toBe('Task to Export');
    expect(exp.issues[0].external_id).toBe('GH-101');
    expect(exp.issues[0].state).toBe('open');
  });
});
