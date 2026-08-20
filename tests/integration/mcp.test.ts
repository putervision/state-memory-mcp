import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { server } from '../../src/server.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';

describe('MCP Server Integration Tests', () => {
  let client: Client;
  const project = 'integration-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
  });

  beforeAll(async () => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
    closeAllDbs();
  });

  it('should list all 13 consolidated tools', async () => {
    const tools = await client.listTools();
    expect(tools.tools).toBeDefined();
    expect(tools.tools.length).toBe(13);

    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain('manage_nodes');
    expect(toolNames).toContain('manage_edges');
    expect(toolNames).toContain('manage_sessions');
    expect(toolNames).toContain('manage_tasks');
    expect(toolNames).toContain('manage_snapshots');
    expect(toolNames).toContain('manage_specs');
    expect(toolNames).toContain('manage_database');
    expect(toolNames).toContain('manage_data');
    expect(toolNames).toContain('query_graph');
    expect(toolNames).toContain('get_analytics');
    expect(toolNames).toContain('get_events');
    expect(toolNames).toContain('run_diagnostics');
    expect(toolNames).toContain('use_blackboard');
  });

  it('should support nodes and edges operations via consolidated tools', async () => {
    // 1. Add Task Node
    const addNodeResult = await client.callTool({
      name: 'manage_nodes',
      arguments: {
        action: 'create',
        project,
        type: 'task',
        title: 'Initial Database Setup',
        status: 'pending',
        metadata: { priority: 'high' },
        tags: ['db', 'phase-1'],
      },
    });

    const node1 = JSON.parse((addNodeResult as any).content[0].text);
    expect(node1.id).toBeDefined();
    expect(node1.title).toBe('Initial Database Setup');

    // 2. Add Second Node (Blocker)
    const addBlockerResult = await client.callTool({
      name: 'manage_nodes',
      arguments: {
        action: 'create',
        project,
        type: 'blocker',
        title: 'Missing Database URI',
        status: 'active',
        metadata: { severity: 'critical' },
      },
    });

    const blocker = JSON.parse((addBlockerResult as any).content[0].text);
    expect(blocker.id).toBeDefined();

    // 3. Update Task Node
    const updateNodeResult = await client.callTool({
      name: 'manage_nodes',
      arguments: {
        action: 'update',
        project,
        id: node1.id,
        status: 'blocked',
        metadata: { estimate: '2h' },
      },
    });

    const updatedNode = JSON.parse((updateNodeResult as any).content[0].text);
    expect(updatedNode.status).toBe('blocked');
    expect(updatedNode.metadata.priority).toBe('high');
    expect(updatedNode.metadata.estimate).toBe('2h');

    // 4. Link Node and Blocker with Edge
    const addEdgeResult = await client.callTool({
      name: 'manage_edges',
      arguments: {
        action: 'add',
        project,
        source_id: blocker.id,
        target_id: node1.id,
        type: 'blocks',
      },
    });

    const edge = JSON.parse((addEdgeResult as any).content[0].text);
    expect(edge.source_id).toBe(blocker.id);
    expect(edge.target_id).toBe(node1.id);
    expect(edge.type).toBe('blocks');

    // 5. List Nodes
    const listResult = await client.callTool({
      name: 'manage_nodes',
      arguments: {
        action: 'list',
        project,
        type: 'task',
      },
    });

    const list = JSON.parse((listResult as any).content[0].text);
    expect(list.total_count).toBe(1);
    expect(list.nodes[0].id).toBe(node1.id);

    // 6. Search Nodes (FTS5)
    const searchResult = await client.callTool({
      name: 'manage_nodes',
      arguments: {
        action: 'search',
        project,
        query: 'Setup',
      },
    });

    const search = JSON.parse((searchResult as any).content[0].text);
    expect(search.total_count).toBe(1);
    expect(search.nodes[0].title).toBe('Initial Database Setup');

    // 7. Find Blockers
    const blockersResult = await client.callTool({
      name: 'manage_tasks',
      arguments: {
        action: 'find_blockers',
        project,
        node_id: node1.id,
      },
    });

    const blockersList = JSON.parse((blockersResult as any).content[0].text);
    expect(blockersList.length).toBe(1);
    expect(blockersList[0].blocker_node.id).toBe(blocker.id);

    // 8. Project Summary
    const summaryResult = await client.callTool({
      name: 'get_analytics',
      arguments: {
        action: 'summary',
        project,
      },
    });

    const summary = JSON.parse((summaryResult as any).content[0].text);
    expect(summary.node_counts.task).toBe(1);
    expect(summary.node_counts.blocker).toBe(1);
    expect(summary.active_blockers.length).toBe(1);

    // 9. Remove Edge
    const removeEdgeResult = await client.callTool({
      name: 'manage_edges',
      arguments: {
        action: 'remove',
        project,
        source_id: blocker.id,
        target_id: node1.id,
        type: 'blocks',
      },
    });

    const removeEdgeResponse = JSON.parse((removeEdgeResult as any).content[0].text);
    expect(removeEdgeResponse.removed).toBe(true);

    // 10. Remove Node
    const removeNodeResult = await client.callTool({
      name: 'manage_nodes',
      arguments: {
        action: 'remove',
        project,
        id: node1.id,
      },
    });

    const removeNodeResponse = JSON.parse((removeNodeResult as any).content[0].text);
    expect(removeNodeResponse.deleted_node_id).toBe(node1.id);
  });

  it('should return error for invalid tool arguments', async () => {
    const res = await client.callTool({
      name: 'manage_nodes',
      arguments: {
        action: 'create',
        project,
        type: 'invalid-type',
        title: '',
      },
    });
    expect(res.isError).toBe(true);
  });
});
