import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { synergyHandlers } from '../../src/handlers/synergy.js';
import { validateMemoryReferences } from '../../src/engine/cross-memory-validation.js';

describe('Dual-Memory Synergy & AST Linking Integration Tests', () => {
  const project = 'synergy-test-project';

  beforeEach(() => {
    closeDb(project);
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  afterEach(() => {
    closeDb(project);
  });

  it('should link visual state IDs to SDD nodes and generate synergy metrics', async () => {
    const task = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Build user settings UI component',
      status: 'done',
    });

    const linkRes = synergyHandlers.link_visual_state({
      project,
      target_id: task.id,
      visual_state_id: 'vs-mock-12345',
      relationship: 'verifies_visual_state',
      visual_description: 'Settings panel renders active toggle state',
    });

    expect(linkRes.success).toBe(true);
    expect(linkRes.relationship).toBe('verifies_visual_state');

    const metrics = await synergyHandlers.get_synergy_metrics({ project });
    expect(metrics.state_memory.completed_tasks).toBe(1);
    expect(metrics.state_memory.ui_verified_tasks).toBe(1);
    expect(metrics.state_memory.ui_verification_ratio_pct).toBe(100);
  });

  it('should export joint multimodal trajectory traces', async () => {
    const task = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Initialize trajectory test',
      status: 'in_progress',
    });

    synergyHandlers.link_visual_state({
      project,
      target_id: task.id,
      visual_state_id: 'vs-trace-999',
      relationship: 'renders_state',
    });

    const jointTrace = await synergyHandlers.export_joint_trajectories({ project, limit: 10 });
    expect(jointTrace.project).toBe('synergy-test-project');
    expect(jointTrace.steps.length).toBeGreaterThan(0);
    expect(jointTrace.steps[0]).toHaveProperty('step_index');
    expect(jointTrace.steps[0]).toHaveProperty('iso_timestamp');
  });

  it('should validate codebase AST symbol metadata in cross-memory validation', () => {
    const artifact = GraphEngine.addNode({
      project,
      type: 'artifact',
      title: 'OrderHandler implementation',
      metadata: {
        codebase_symbol: 'pkg/orders.OrderHandler',
      },
    });

    const valResult = validateMemoryReferences({ project, auto_heal: true });
    expect(valResult.total_references_checked).toBeGreaterThan(0);
    expect(valResult.broken_references.length).toBe(0);
  });
});
