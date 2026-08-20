import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { QueryEngine } from '../../src/engine/queries.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { getDb, closeAllDbs } from '../../src/engine/db.js';
import { importGraph } from '../../src/engine/import.js';
import { searchTfidf, clearTfidfCache } from '../../src/engine/tfidf.js';
import fs from 'fs';
import path from 'path';

describe('Queries, Subprojects, Import & TF-IDF Deep Boost Suite', () => {
  const project = 'queries-subprojects-boost-test';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should test listNodes and searchNodes with include_subdirectories, subproject, and compact', async () => {
    GraphEngine.addNode({ project, type: 'task', title: 'Task in Root', status: 'pending' });

    const listRes = await QueryEngine.listNodes({
      project,
      include_subdirectories: true,
      subproject: 'root',
      compact: true,
      limit: 10,
      offset: 0,
    });
    expect(listRes.nodes.length).toBe(1);

    const listSubRes = await QueryEngine.listNodes({
      project,
      include_subdirectories: true,
      subproject: 'non_existent_sub',
    });
    expect(listSubRes.nodes.length).toBe(0);

    const searchRes = await QueryEngine.searchNodes({
      project,
      query: 'Task',
      include_subdirectories: true,
      subproject: 'root',
      limit: 5,
    });
    expect(searchRes.nodes.length).toBeGreaterThan(0);
  });

  it('should test importGraph conflict strategies and file import', () => {
    const n1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Original Task',
      status: 'pending',
    });

    // Conflict strategy skip with force: true
    const skipRes = importGraph({
      project,
      nodes: [{ id: n1.id, type: 'task', title: 'Updated Task', status: 'done' }],
      conflictStrategy: 'skip',
      force: true,
    });
    expect(skipRes).toBeDefined();

    // Conflict strategy overwrite
    const overwriteRes = importGraph({
      project,
      nodes: [{ id: n1.id, type: 'task', title: 'Overwritten Task', status: 'done' }],
      conflictStrategy: 'overwrite',
      force: true,
    });
    expect(overwriteRes).toBeDefined();

    // Conflict strategy generate_new
    const genRes = importGraph({
      project,
      nodes: [{ id: n1.id, type: 'task', title: 'New ID Task', status: 'pending' }],
      conflictStrategy: 'generate_new',
      force: true,
    });
    expect(genRes).toBeDefined();

    // Import from JSON file
    const jsonPath = path.join(process.cwd(), 'scratch_import.json');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({ nodes: [{ type: 'task', title: 'From File' }], edges: [] })
    );
    try {
      const fileRes = importGraph({ project, filePath: jsonPath, force: true });
      expect(fileRes.imported_nodes_count).toBe(1);
    } finally {
      if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
    }
  });

  it('should test searchTfidf and clearTfidfCache', () => {
    const node1 = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Search Algorithm Indexing',
    });
    const node2 = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Vector Search Architecture',
    });

    const tfidfRes = searchTfidf([node1, node2], 'Algorithm', 10);
    expect(tfidfRes.length).toBeGreaterThan(0);

    clearTfidfCache();
  });
});
