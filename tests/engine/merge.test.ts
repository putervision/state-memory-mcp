import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getDb, closeAllDbs } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { backupProjectDb } from '../../src/engine/backup.js';
import { mergeProjectDb } from '../../src/engine/merge.js';

describe('Merge Engine', () => {
  const targetProject = 'merge-target-project';
  const sourceProject = 'merge-source-project';
  const sourceDbFile = path.join(process.cwd(), '.state-memory-mcp', 'source-merge.db');

  beforeAll(async () => {
    closeAllDbs();

    // Target DB setup
    GraphEngine.addNode({
      project: targetProject,
      type: 'task',
      title: 'Target Task',
      status: 'pending',
    });

    // Source DB setup
    GraphEngine.addNode({
      project: sourceProject,
      type: 'decision',
      title: 'Source Decision',
      status: 'accepted',
    });

    await backupProjectDb({ project: sourceProject, outputPath: sourceDbFile });
  });

  afterAll(() => {
    closeAllDbs();
    if (fs.existsSync(sourceDbFile)) fs.unlinkSync(sourceDbFile);
    if (fs.existsSync(`${sourceDbFile}.sha256`)) fs.unlinkSync(`${sourceDbFile}.sha256`);
  });

  it('should merge nodes from external database into target project database', () => {
    const mergeResult = mergeProjectDb({
      project: targetProject,
      sourcePath: sourceDbFile,
    });

    expect(mergeResult.nodes_added).toBeGreaterThanOrEqual(1);

    const db = getDb(targetProject);
    const decisionNode = db
      .prepare("SELECT title FROM nodes WHERE project = ? AND type = 'decision'")
      .get(targetProject) as any;
    expect(decisionNode).toBeDefined();
    expect(decisionNode.title).toBe('Source Decision');
  });
});
