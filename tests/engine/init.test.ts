import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runInit } from '../../src/cli/init.js';
import { closeAllDbs, getDb, getProjectDbDir } from '../../src/engine/db.js';

describe('CLI Init and Post-Init Updates', () => {
  const project = 'temp-init-test-dir';
  const tempTestDir = path.resolve('./temp-init-test-dir');

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
    db.prepare('DELETE FROM events WHERE project = ?').run(project);
  });

  it('should run init, scaffold templates, generate HTML visualizer, and perform graph validation', async () => {
    // Write package.json so tech stack discovers it
    fs.writeFileSync(path.join(tempTestDir, 'package.json'), '{}', 'utf-8');

    // Run init
    await runInit(tempTestDir, {
      fromGit: false,
    });

    const db = getDb(project);

    // Verify static and tech stack nodes are scaffolded
    const planNode = db
      .prepare(`SELECT 1 FROM nodes WHERE project = ? AND type = 'plan'`)
      .get(project);
    expect(planNode).toBeDefined();

    const artNode = db
      .prepare(
        `SELECT 1 FROM nodes WHERE project = ? AND type = 'artifact' AND title = 'package.json'`
      )
      .get(project);
    expect(artNode).toBeDefined();

    // Verify HTML visualizer was auto-generated
    const projectDbDir = getProjectDbDir(project);
    const htmlPath = path.join(projectDbDir, 'viewer.html');
    expect(fs.existsSync(htmlPath)).toBe(true);
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    expect(htmlContent).toContain('<!DOCTYPE html>');
  });

  it('should prune events if pruneEvents duration is passed', async () => {
    const db = getDb(project);

    // Seed events
    const session_id = 'test-session';
    const now = Date.now();
    const oldTime = new Date(now - 10 * 24 * 3600 * 1000).toISOString(); // 10 days ago

    // Insert events manually
    db.prepare(
      `
      INSERT INTO events (id, project, event_type, entity_type, entity_id, session_id, before_state, after_state, timestamp)
      VALUES 
        ('ev1', ?, 'node_created', 'node', 'n1', ?, null, '{"id":"n1"}', ?),
        ('ev2', ?, 'node_updated', 'node', 'n1', ?, '{"id":"n1"}', '{"id":"n1","title":"new"}', ?),
        ('ev3', ?, 'node_created', 'node', 'n2', ?, null, '{"id":"n2"}', ?)
    `
    ).run(
      project,
      session_id,
      oldTime,
      project,
      session_id,
      oldTime,
      project,
      session_id,
      new Date(now).toISOString()
    );

    // Make sure we have candidates that are NOT the latest version of their entity
    // In this case, ev1 is for n1 (old), ev2 is for n1 (newer/latest of n1), ev3 is for n2 (new/latest of n2)
    // So ev1 is eligible for pruning because it's old and not the latest state for n1.

    // Run init with pruneEvents set to 5 days ('5d')
    await runInit(tempTestDir, {
      fromGit: false,
      pruneEvents: '5d',
    });

    // Check if ev1 was pruned
    const ev1Exists = db.prepare(`SELECT 1 FROM events WHERE id = 'ev1'`).get();
    expect(ev1Exists).toBeUndefined();

    // Make sure latest events (ev2, ev3) were NOT pruned
    const ev2Exists = db.prepare(`SELECT 1 FROM events WHERE id = 'ev2'`).get();
    expect(ev2Exists).toBeDefined();

    const ev3Exists = db.prepare(`SELECT 1 FROM events WHERE id = 'ev3'`).get();
    expect(ev3Exists).toBeDefined();
  });
});
