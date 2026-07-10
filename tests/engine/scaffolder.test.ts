import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  runStaticScaffolder,
  runTechStackScaffolder,
  STATIC_NODE_TEMPLATES,
  STATIC_EDGE_TEMPLATES,
  scaffoldTemplate,
} from '../../src/engine/scaffolder.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';

describe('Scaffolding Engine', () => {
  const project = 'scaffolder-test-project';
  const tempTestDir = path.resolve('./temp-scaffolder-test-dir');

  beforeAll(() => {
    if (fs.existsSync(tempTestDir)) {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempTestDir, { recursive: true });
  });

  afterAll(() => {
    closeAllDbs();
    if (fs.existsSync(tempTestDir)) {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  it('should seed static nodes and edges on a fresh run', async () => {
    const db = getDb(project);
    await runStaticScaffolder(project, db);

    // Verify all static node templates exist in DB
    for (const template of STATIC_NODE_TEMPLATES) {
      const node = db
        .prepare(
          `
        SELECT id FROM nodes 
        WHERE project = ? AND type = ? AND json_extract(metadata, '$.scaffold_key') = ?
      `
        )
        .get(project, template.type, template.scaffold_key);
      expect(node).toBeDefined();
    }

    // Verify edge counts
    const edgeCount = db
      .prepare('SELECT COUNT(*) as count FROM edges WHERE project = ?')
      .get(project) as { count: number };
    expect(edgeCount.count).toBe(STATIC_EDGE_TEMPLATES.length);
  });

  it('should be idempotent and not duplicate nodes or edges on subsequent runs', async () => {
    const db = getDb(project);

    // First run
    await runStaticScaffolder(project, db);
    const nodeCount1 = db
      .prepare('SELECT COUNT(*) as count FROM nodes WHERE project = ?')
      .get(project) as { count: number };
    const edgeCount1 = db
      .prepare('SELECT COUNT(*) as count FROM edges WHERE project = ?')
      .get(project) as { count: number };

    // Second run
    await runStaticScaffolder(project, db);
    const nodeCount2 = db
      .prepare('SELECT COUNT(*) as count FROM nodes WHERE project = ?')
      .get(project) as { count: number };
    const edgeCount2 = db
      .prepare('SELECT COUNT(*) as count FROM edges WHERE project = ?')
      .get(project) as { count: number };

    expect(nodeCount1.count).toBe(nodeCount2.count);
    expect(edgeCount1.count).toBe(edgeCount2.count);
    expect(nodeCount1.count).toBe(STATIC_NODE_TEMPLATES.length);
  });

  it('should recreate a deleted scaffold node and its edges without affecting others', async () => {
    const db = getDb(project);
    await runStaticScaffolder(project, db);

    // Get the milestone:setup:v1 node
    const setupNode = db
      .prepare(
        `
      SELECT id FROM nodes 
      WHERE project = ? AND json_extract(metadata, '$.scaffold_key') = 'milestone:setup:v1'
    `
      )
      .get(project) as { id: string } | undefined;
    expect(setupNode).toBeDefined();

    // Delete setup milestone node
    GraphEngine.removeNode({ project, id: setupNode!.id });

    // Run scaffolder again
    await runStaticScaffolder(project, db);

    // Verify node has been recreated
    const setupNodeRecreated = db
      .prepare(
        `
      SELECT id FROM nodes 
      WHERE project = ? AND json_extract(metadata, '$.scaffold_key') = 'milestone:setup:v1'
    `
      )
      .get(project) as { id: string } | undefined;
    expect(setupNodeRecreated).toBeDefined();
    expect(setupNodeRecreated!.id).not.toBe(setupNode!.id);

    // Verify edges are also restored
    const edgeCount = db
      .prepare('SELECT COUNT(*) as count FROM edges WHERE project = ?')
      .get(project) as { count: number };
    expect(edgeCount.count).toBe(STATIC_EDGE_TEMPLATES.length);
  });

  it('should discover tech stack configuration files and link them to setup milestone', async () => {
    const db = getDb(project);

    // First setup static scaffolding so milestone:setup:v1 exists
    await runStaticScaffolder(project, db);

    // Write a dummy package.json and requirements.txt in the temp test directory
    fs.writeFileSync(path.join(tempTestDir, 'package.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(tempTestDir, 'requirements.txt'), 'vitest', 'utf-8');

    // Run tech stack discovery
    await runTechStackScaffolder(project, db, tempTestDir);

    // Verify artifacts exist
    const pkgNode = db
      .prepare(
        `
      SELECT id, tags FROM nodes 
      WHERE project = ? AND type = 'artifact' AND title = 'package.json'
    `
      )
      .get(project) as { id: string; tags: string } | undefined;
    expect(pkgNode).toBeDefined();
    expect(JSON.parse(pkgNode!.tags)).toContain('typescript');

    const reqNode = db
      .prepare(
        `
      SELECT id, tags FROM nodes 
      WHERE project = ? AND type = 'artifact' AND title = 'requirements.txt'
    `
      )
      .get(project) as { id: string; tags: string } | undefined;
    expect(reqNode).toBeDefined();
    expect(JSON.parse(reqNode!.tags)).toContain('python');

    // Verify they are linked to milestone:setup:v1 with a 'produces' edge
    const setupNode = db
      .prepare(
        `
      SELECT id FROM nodes 
      WHERE project = ? AND json_extract(metadata, '$.scaffold_key') = 'milestone:setup:v1'
    `
      )
      .get(project) as { id: string } | undefined;

    const pkgEdge = db
      .prepare(
        `
      SELECT 1 FROM edges 
      WHERE project = ? AND source_id = ? AND target_id = ? AND type = 'produces'
    `
      )
      .get(project, setupNode!.id, pkgNode!.id);
    expect(pkgEdge).toBeDefined();

    const reqEdge = db
      .prepare(
        `
      SELECT 1 FROM edges 
      WHERE project = ? AND source_id = ? AND target_id = ? AND type = 'produces'
    `
      )
      .get(project, setupNode!.id, reqNode!.id);
    expect(reqEdge).toBeDefined();
  });

  it('should scaffold FDD and RFC templates successfully', () => {
    const fddResult = scaffoldTemplate({
      project,
      template: 'fdd',
      name: 'Auth Module',
    });
    expect(fddResult.nodes_created).toBe(8);
    expect(fddResult.edges_created).toBe(7);

    const rfcResult = scaffoldTemplate({
      project,
      template: 'rfc',
      name: 'GraphQL Migration',
    });
    expect(rfcResult.nodes_created).toBe(4);
    expect(rfcResult.edges_created).toBe(3);
  });
});
