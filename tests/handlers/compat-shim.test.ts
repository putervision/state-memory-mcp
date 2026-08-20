import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  LEGACY_TOOL_MAP,
  translateLegacyCall,
  REMOVED_TOOLS,
} from '../../src/tools/compat-shim.js';
import { toolHandlers } from '../../src/handlers/index.js';
import { getDb, closeAllDbs } from '../../src/engine/db.js';

describe('Backward Compatibility Shim & Legacy Tool Mapping Tests', () => {
  const project = 'compat-shim-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
    db.prepare('DELETE FROM events WHERE project = ?').run(project);
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should map all 78 legacy tools into their corresponding consolidated tools and actions', () => {
    for (const [legacyName, mapping] of Object.entries(LEGACY_TOOL_MAP)) {
      expect(mapping.tool).toBeDefined();
      expect(mapping.action).toBeDefined();
      expect(toolHandlers[mapping.tool]).toBeDefined();
    }
  });

  it('should correctly throw error on removed stub tools', () => {
    for (const removedName of Object.keys(REMOVED_TOOLS)) {
      expect(() => translateLegacyCall(removedName, {})).toThrow();
    }
  });

  it('should correctly translate add_node to manage_nodes create', async () => {
    const { tool, action, transformedArgs } = translateLegacyCall('add_node', {
      project,
      type: 'task',
      title: 'Legacy task creation',
      status: 'pending',
    });

    expect(tool).toBe('manage_nodes');
    expect(action).toBe('create');
    expect(transformedArgs.action).toBe('create');
    expect(transformedArgs.title).toBe('Legacy task creation');

    const result: any = await toolHandlers[tool](transformedArgs);
    expect(result.id).toBeDefined();
    expect(result.title).toBe('Legacy task creation');
  });

  it('should correctly translate start_session, get_project_summary, and next_tasks', async () => {
    const startCall = translateLegacyCall('start_session', { project, agent_id: 'legacy-agent' });
    expect(startCall.tool).toBe('manage_sessions');
    expect(startCall.action).toBe('start');
    const sessionRes: any = await toolHandlers[startCall.tool](startCall.transformedArgs);
    expect(sessionRes.session_id).toBeDefined();

    const summaryCall = translateLegacyCall('get_project_summary', { project });
    expect(summaryCall.tool).toBe('get_analytics');
    expect(summaryCall.action).toBe('summary');
    const summaryRes: any = await toolHandlers[summaryCall.tool](summaryCall.transformedArgs);
    expect(summaryRes.node_counts).toBeDefined();

    const nextCall = translateLegacyCall('next_tasks', { project, limit: 5 });
    expect(nextCall.tool).toBe('manage_tasks');
    expect(nextCall.action).toBe('next');
    const nextRes: any = await toolHandlers[nextCall.tool](nextCall.transformedArgs);
    expect(Array.isArray(nextRes.tasks)).toBe(true);
  });

  it('should correctly translate rename arguments in legacy tools', () => {
    const { transformedArgs } = translateLegacyCall('find_similar_blockers', {
      project,
      query: 'database lock',
      limit: 10,
    });
    expect(transformedArgs.action).toBe('find_similar_blockers');
    expect(transformedArgs.query).toBe('database lock');
  });
});
