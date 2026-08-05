import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { synergyHandlers } from '../src/handlers/synergy.js';
import { GraphEngine } from '../src/engine/graph.js';
import { getDb, registerProject } from '../src/engine/db.js';
import { validateGraph } from '../src/engine/validate.js';
import { redactData, redactText } from '../src/utils/redact.js';
import fs from 'fs';
import path from 'path';

const TEST_PROJECT = 'test-synergy-project';
const TEST_DIR = path.resolve(process.cwd(), '.state-memory-mcp/test-synergy-project');

describe('Dual MCP Synergy & Interop Tests', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    registerProject(TEST_PROJECT, process.cwd());
  });

  afterEach(() => {
    try {
      const db = getDb(TEST_PROJECT);
      db.prepare(`DELETE FROM nodes WHERE project = ?`).run(TEST_PROJECT);
      db.prepare(`DELETE FROM edges WHERE project = ?`).run(TEST_PROJECT);
      db.prepare(`DELETE FROM events WHERE project = ?`).run(TEST_PROJECT);
    } catch {}
  });

  it('should redact sensitive tokens and credentials from text and objects', () => {
    const rawSecret = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret sk-abcdef123456789012345678';
    const redacted = redactText(rawSecret);
    expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(redacted).toContain('[REDACTED]');

    const obj = redactData({
      user: 'alice',
      password: 'SuperSecretPassword123!',
      api_key: 'sk-abcdef123456789012345678',
    });
    expect(obj.password).toBe('[REDACTED]');
    expect(obj.api_key).toBe('[REDACTED]');
  });

  it('should create visual_state nodes and link_visual_state bidirectionally', () => {
    const task = GraphEngine.addNode({
      project: TEST_PROJECT,
      type: 'task',
      title: 'Render header navigation bar',
      status: 'pending',
    });

    const res = synergyHandlers.link_visual_state({
      project: TEST_PROJECT,
      target_id: task.id || (task as any).node?.id,
      visual_state_id: 'vs-test-101',
      relationship: 'renders_state',
      visual_description: 'Header navigation bar aligned',
      source_url: 'http://localhost:3000',
    });

    expect(res.success).toBe(true);
    expect(res.relationship).toBe('renders_state');
    expect(res.visual_state_id).toBe('vs-test-101');

    const vsNode = GraphEngine.getNode({ project: TEST_PROJECT, id: res.target_id });
    expect(vsNode).toBeDefined();
    expect(vsNode?.node.type).toBe('visual_state');
  });

  it('should validate graph and check verifies_visual_state / renders_state for UI tasks', () => {
    const db = getDb(TEST_PROJECT);
    const task = GraphEngine.addNode({
      project: TEST_PROJECT,
      type: 'task',
      title: 'Align UI buttons on landing page',
      status: 'done',
      tags: ['ui'],
    });

    let validation = validateGraph(db, { project: TEST_PROJECT });
    const unverifiedUi = validation.issues.filter((i) => i.check === 'unverified_ui');
    expect(unverifiedUi.length).toBeGreaterThan(0);

    synergyHandlers.link_visual_state({
      project: TEST_PROJECT,
      target_id: task.id || (task as any).node?.id,
      visual_state_id: 'vs-test-102',
      relationship: 'verifies_visual_state',
    });

    validation = validateGraph(db, { project: TEST_PROJECT });
    const unverifiedUiAfter = validation.issues.filter((i) => i.check === 'unverified_ui');
    expect(unverifiedUiAfter.length).toBe(0);
  });

  it('should export joint trajectories and calculate synergy metrics', async () => {
    const task = GraphEngine.addNode({
      project: TEST_PROJECT,
      type: 'task',
      title: 'Export trajectory test task',
      status: 'pending',
    });

    synergyHandlers.link_visual_state({
      project: TEST_PROJECT,
      target_id: task.id || (task as any).node?.id,
      visual_state_id: 'vs-1',
    });

    const trajectories = await synergyHandlers.export_joint_trajectories({ project: TEST_PROJECT });
    expect(trajectories.project).toBe(TEST_PROJECT);
    expect(Array.isArray(trajectories.steps)).toBe(true);

    const metrics = await synergyHandlers.get_synergy_metrics({ project: TEST_PROJECT });
    expect(metrics.project).toBe(TEST_PROJECT);
    expect(metrics.state_memory).toBeDefined();
    expect(metrics.synergy_health).toBeDefined();
  });

  it('should validate parameters and error handling in link_visual_state', () => {
    expect(() =>
      synergyHandlers.link_visual_state({
        project: TEST_PROJECT,
        target_id: '',
        visual_state_id: 'vs-1',
      })
    ).toThrow();

    expect(() =>
      synergyHandlers.link_visual_state({
        project: TEST_PROJECT,
        target_id: 'non-existent-target-id',
        visual_state_id: 'vs-1',
      })
    ).toThrow();
  });

  it('should link visual state with blocked_by_visual_state relationship', () => {
    const task = GraphEngine.addNode({
      project: TEST_PROJECT,
      type: 'task',
      title: 'Blocked task by visual state',
      status: 'pending',
    });

    const res = synergyHandlers.link_visual_state({
      project: TEST_PROJECT,
      target_id: task.id || (task as any).node?.id,
      visual_state_id: 'vs-blocker-1',
      relationship: 'blocked_by_visual_state',
    });

    expect(res.success).toBe(true);
    expect(res.relationship).toBe('blocked_by_visual_state');
  });

  it('should filter export_joint_trajectories by session_id', async () => {
    const trajectories = await synergyHandlers.export_joint_trajectories({
      project: TEST_PROJECT,
      session_id: 'sess-12345',
    });
    expect(trajectories.session_id).toBe('sess-12345');
    expect(Array.isArray(trajectories.steps)).toBe(true);
  });
});

