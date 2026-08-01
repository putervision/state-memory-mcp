import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { importGraph } from '../../src/engine/import.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { getDb, closeAllDbs } from '../../src/engine/db.js';
import { ValidationError } from '../../src/utils/errors.js';

describe('Import Engine & Database Ops Edge Cases', () => {
  const project = 'import-edge-test-project';
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-test-'));
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should throw ValidationError if import file size exceeds limit', () => {
    const filePath = path.join(tmpDir, 'large-import.json');
    const content = JSON.stringify({ nodes: [{ type: 'task', title: 'Large Task' }] });
    fs.writeFileSync(filePath, content);

    expect(() =>
      importGraph({
        project,
        filePath,
        fileSizeLimitBytes: 10, // 10 bytes limit
      })
    ).toThrow(ValidationError);
  });

  it('should throw ValidationError if import file contains malformed JSON', () => {
    const filePath = path.join(tmpDir, 'corrupt.json');
    fs.writeFileSync(filePath, '{ corrupt json payload...');

    expect(() =>
      importGraph({
        project,
        filePath,
      })
    ).toThrow(ValidationError);
  });

  it('should throw ValidationError if an imported node fails schema validation', () => {
    expect(() =>
      importGraph({
        project,
        nodes: [{ title: 'Missing Type Node' }], // missing 'type'
      })
    ).toThrow(ValidationError);
  });

  it('should throw ValidationError if an imported edge fails schema validation', () => {
    expect(() =>
      importGraph({
        project,
        edges: [{ source_id: 'node-1' }], // missing target_id & type
      })
    ).toThrow(ValidationError);
  });

  it('should handle conflictStrategy "overwrite" and "generate_new"', () => {
    const nodeA = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Original Task',
      status: 'pending',
    });

    // Overwrite strategy
    const resOverwrite = importGraph({
      project,
      nodes: [
        {
          id: nodeA.id,
          type: 'task',
          title: 'Overwritten Task Title',
          status: 'done',
        },
      ],
      conflictStrategy: 'overwrite',
      force: true,
    });
    expect(resOverwrite.imported_nodes_count).toBe(1);

    const fetchedOverwritten = GraphEngine.getNode({ project, id: nodeA.id });
    expect(fetchedOverwritten?.node.title).toBe('Overwritten Task Title');

    // Generate New strategy
    const resGenNew = importGraph({
      project,
      nodes: [
        {
          id: nodeA.id,
          type: 'task',
          title: 'Generated New Task',
          status: 'in_progress',
        },
      ],
      conflictStrategy: 'generate_new',
      force: true,
    });
    expect(resGenNew.imported_nodes_count).toBe(1);
  });
});
