import { describe, it, expect, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllPrompts } from '../../src/tools/prompts.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { closeAllDbs } from '../../src/engine/db.js';

describe('MCP Prompts Engine', () => {
  const project = 'prompts-test-project';

  afterAll(() => {
    closeAllDbs();
  });

  it('should register all prompts on McpServer instance', () => {
    const server = new McpServer({ name: 'test-server', version: '1.0.0' });
    expect(() => registerAllPrompts(server)).not.toThrow();
  });

  it('should generate review-decisions prompt message', async () => {
    const proj = `prompts-review-${Date.now()}`;
    const server = new McpServer({ name: 'test-server', version: '1.0.0' });
    registerAllPrompts(server);

    // Seed a decision
    GraphEngine.addNode({
      project: proj,
      type: 'decision',
      title: 'Adopt SQLite DB',
      status: 'accepted',
    });

    const prompts = (server as any)._registeredPrompts;
    const reviewPrompt = prompts['review-decisions'];
    expect(reviewPrompt).toBeDefined();

    const handlerFn = reviewPrompt.callback || reviewPrompt.handler;
    const res = await handlerFn({ project: proj });
    expect(res.messages).toHaveLength(1);
    expect(res.messages[0].content.text).toContain('Adopt SQLite DB');
  });

  it('should generate review-decisions with contradictions message', async () => {
    const proj = `prompts-contra-${Date.now()}`;
    const server = new McpServer({ name: 'test-server', version: '1.0.0' });
    registerAllPrompts(server);

    // Create done task with active blocker
    const task = GraphEngine.addNode({
      project: proj,
      type: 'task',
      title: 'Done Task',
      status: 'done',
    });
    const blocker = GraphEngine.addNode({
      project: proj,
      type: 'blocker',
      title: 'Active Blocker',
      status: 'active',
    });
    EdgeEngine.addEdge({
      project: proj,
      source_id: blocker.id,
      target_id: task.id,
      type: 'blocks',
    });

    const prompts = (server as any)._registeredPrompts;
    const reviewPrompt = prompts['review-decisions'];
    const handlerFn = reviewPrompt.callback || reviewPrompt.handler;
    const res = await handlerFn({ project: proj });
    expect(res.messages[0].content.text).toContain('Detected 1 logical anomalies');
  });

  it('should generate triage-blockers prompt message', async () => {
    const proj = `prompts-triage-${Date.now()}`;
    const server = new McpServer({ name: 'test-server', version: '1.0.0' });
    registerAllPrompts(server);

    const task = GraphEngine.addNode({
      project: proj,
      type: 'task',
      title: 'Blocked Task',
    });
    const blocker = GraphEngine.addNode({
      project: proj,
      type: 'blocker',
      title: 'Active Blocker',
      status: 'active',
    });
    EdgeEngine.addEdge({
      project: proj,
      source_id: blocker.id,
      target_id: task.id,
      type: 'blocks',
    });

    const prompts = (server as any)._registeredPrompts;
    const triagePrompt = prompts['triage-blockers'];
    expect(triagePrompt).toBeDefined();

    const handlerFn = triagePrompt.callback || triagePrompt.handler;
    const res = await handlerFn({ project: proj });
    expect(res.messages).toHaveLength(1);
    expect(res.messages[0].content.text).toContain('Active Blocker');
  });
});
