import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveAction,
  generateToolActionGuidance,
  TOOL_ACTION_REGISTRY,
} from '../../src/engine/advisor.js';
import { nodeHandlers } from '../../src/handlers/node.js';
import { batchHandlers } from '../../src/handlers/batch.js';
import { getDb } from '../../src/engine/db.js';

describe('Dynamic Self-Healing & API Schema Advisor', () => {
  const project = 'advisor-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  it('should have all 13 consolidated tools documented in TOOL_ACTION_REGISTRY', () => {
    const tools = Object.keys(TOOL_ACTION_REGISTRY);
    expect(tools).toHaveLength(13);
    expect(tools).toContain('manage_nodes');
    expect(tools).toContain('manage_edges');
    expect(tools).toContain('manage_sessions');
    expect(tools).toContain('manage_tasks');
    expect(tools).toContain('manage_snapshots');
    expect(tools).toContain('manage_specs');
    expect(tools).toContain('manage_database');
    expect(tools).toContain('manage_data');
    expect(tools).toContain('query_graph');
    expect(tools).toContain('get_analytics');
    expect(tools).toContain('get_events');
    expect(tools).toContain('run_diagnostics');
    expect(tools).toContain('use_blackboard');
  });

  it('should resolve standard valid actions directly', () => {
    const res = resolveAction('manage_nodes', 'create', {});
    expect(res.action).toBe('create');
    expect(res.inferred).toBe(false);
  });

  it('should resolve action aliases correctly (add -> create, edit -> update, delete -> remove)', () => {
    expect(resolveAction('manage_nodes', 'add', {}).action).toBe('create');
    expect(resolveAction('manage_nodes', 'insert', {}).action).toBe('create');
    expect(resolveAction('manage_nodes', 'edit', {}).action).toBe('update');
    expect(resolveAction('manage_nodes', 'delete', {}).action).toBe('remove');
    expect(resolveAction('manage_nodes', 'find', {}).action).toBe('search');
    expect(resolveAction('manage_tasks', 'done', {}).action).toBe('complete');
    expect(resolveAction('manage_tasks', 'queue', {}).action).toBe('next');
    expect(resolveAction('manage_sessions', 'begin', {}).action).toBe('start');
  });

  it('should intelligently infer action when action parameter is omitted', () => {
    // manage_nodes: type and title -> create
    const createRes = resolveAction('manage_nodes', undefined, { type: 'task', title: 'New Task' });
    expect(createRes.action).toBe('create');
    expect(createRes.inferred).toBe(true);

    // manage_nodes: id and status -> update
    const updateRes = resolveAction('manage_nodes', undefined, { id: '01ABC', status: 'done' });
    expect(updateRes.action).toBe('update');

    // manage_nodes: query -> search
    const searchRes = resolveAction('manage_nodes', undefined, { query: 'auth' });
    expect(searchRes.action).toBe('search');

    // manage_tasks: task_id -> complete
    const completeRes = resolveAction('manage_tasks', undefined, { task_id: '01ABC' });
    expect(completeRes.action).toBe('complete');

    // manage_sessions: agent_id -> start
    const startRes = resolveAction('manage_sessions', undefined, { agent_id: 'copilot' });
    expect(startRes.action).toBe('start');
  });

  it('should return rich structured self-healing guidance on invalid actions', () => {
    const res = resolveAction('manage_nodes', 'invalid_action_xyz', {});
    expect(res.action).toBeNull();
    expect(res.errorGuidance).toBeDefined();
    expect(res.errorGuidance?.isError).toBe(true);
    expect(res.errorGuidance?.supported_actions).toBeDefined();
    expect(res.errorGuidance?.supported_actions.create).toBeDefined();
    expect(res.errorGuidance?.self_healing_hint).toContain(
      'Call "manage_nodes" with one of the supported actions'
    );
  });

  it('should generate guidance for unknown tools', () => {
    const guidance = generateToolActionGuidance('unknown_tool_name');
    expect(guidance.error).toContain('Unknown tool');
    expect(guidance.supported_tools).toHaveLength(13);
  });

  it('should execute nodeHandler when action is inferred', () => {
    const node = nodeHandlers.manage_nodes({
      action: 'create',
      project,
      type: 'task',
      title: 'Auto-inferred task',
    });
    expect(node).toBeDefined();
    expect((node as any).title).toBe('Auto-inferred task');
  });
});
