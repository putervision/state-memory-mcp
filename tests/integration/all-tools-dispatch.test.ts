import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  NativeClient as Client,
  NativeInMemoryTransport as InMemoryTransport,
} from '../../src/transport/native-mcp.js';
import { server } from '../../src/server.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';

describe('All MCP Consolidated Tools Dispatch Test Suite', () => {
  let client: Client;
  const project = 'all-tools-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
    db.prepare('DELETE FROM sessions WHERE project = ?').run(project);
    db.prepare('DELETE FROM events WHERE project = ?').run(project);
    db.prepare('DELETE FROM snapshots WHERE project = ?').run(project);
    db.prepare('DELETE FROM blackboard WHERE project = ?').run(project);
  });

  beforeAll(async () => {
    process.env.STATE_MEMORY_ADMIN_MODE = 'true';
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      {
        name: 'all-tools-test-client',
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

  it('should dispatch all 13 tools cleanly via client.callTool', async () => {
    // 1. manage_nodes (create)
    const addRes = await client.callTool({
      name: 'manage_nodes',
      arguments: {
        action: 'create',
        project,
        type: 'task',
        title: 'Task A',
        status: 'pending',
        metadata: { priority: 'high' },
        tags: ['backend'],
      },
    });
    const nodeA = JSON.parse((addRes as any).content[0].text);
    expect(nodeA.id).toBeDefined();

    const addRes2 = await client.callTool({
      name: 'manage_nodes',
      arguments: {
        action: 'create',
        project,
        type: 'decision',
        title: 'Decision 1',
        status: 'accepted',
        metadata: { rationale: 'best choice' },
        tags: ['arch'],
      },
    });
    const nodeB = JSON.parse((addRes2 as any).content[0].text);

    // 2. manage_edges (add)
    const edgeRes = await client.callTool({
      name: 'manage_edges',
      arguments: {
        action: 'add',
        project,
        source_id: nodeA.id,
        target_id: nodeB.id,
        type: 'decided_in',
      },
    });
    expect((edgeRes as any).content[0].text).toContain('decided_in');

    // 3. manage_sessions (start)
    const startRes = await client.callTool({
      name: 'manage_sessions',
      arguments: {
        action: 'start',
        project,
        agent_id: 'dispatch-agent',
      },
    });
    const session = JSON.parse((startRes as any).content[0].text);
    expect(session.session_id).toBeDefined();

    // 4. manage_tasks (next)
    const nextRes = await client.callTool({
      name: 'manage_tasks',
      arguments: {
        action: 'next',
        project,
      },
    });
    const nextObj = JSON.parse((nextRes as any).content[0].text);
    expect(Array.isArray(nextObj.tasks)).toBe(true);

    // 5. manage_snapshots (save)
    const snapRes = await client.callTool({
      name: 'manage_snapshots',
      arguments: {
        action: 'save',
        project,
        session_id: session.session_id,
        force: true,
      },
    });
    const snap = JSON.parse((snapRes as any).content[0].text);
    expect(snap.snapshot_id).toBeDefined();

    // 6. query_graph (subgraph)
    const subRes = await client.callTool({
      name: 'query_graph',
      arguments: {
        action: 'subgraph',
        project,
        root_id: nodeA.id,
      },
    });
    expect(JSON.parse((subRes as any).content[0].text).nodes).toBeDefined();

    // 7. get_analytics (summary, decision_trail)
    const sumRes = await client.callTool({
      name: 'get_analytics',
      arguments: {
        action: 'summary',
        project,
      },
    });
    expect(JSON.parse((sumRes as any).content[0].text).node_counts).toBeDefined();

    const decRes = await client.callTool({
      name: 'get_analytics',
      arguments: {
        action: 'decision_trail',
        project,
        node_id: nodeB.id,
      },
    });
    expect(JSON.parse((decRes as any).content[0].text).decisions).toBeDefined();

    // 8. get_events (log)
    const logRes = await client.callTool({
      name: 'get_events',
      arguments: {
        action: 'log',
        project,
      },
    });
    expect(Array.isArray(JSON.parse((logRes as any).content[0].text))).toBe(true);

    // 9. run_diagnostics (validate, version)
    const diagRes = await client.callTool({
      name: 'run_diagnostics',
      arguments: {
        action: 'validate',
        project,
      },
    });
    expect(JSON.parse((diagRes as any).content[0].text).passed).toBe(true);

    const verRes = await client.callTool({
      name: 'run_diagnostics',
      arguments: {
        action: 'version',
        project,
      },
    });
    expect(JSON.parse((verRes as any).content[0].text).version).toBeDefined();

    // 10. manage_data (export_graph, import_issues)
    const expRes = await client.callTool({
      name: 'manage_data',
      arguments: {
        action: 'export_graph',
        project,
      },
    });
    expect(JSON.parse((expRes as any).content[0].text).nodes).toBeDefined();

    const impRes = await client.callTool({
      name: 'manage_data',
      arguments: {
        action: 'import_issues',
        project,
        issues: [
          {
            external_id: 'GH-101',
            title: 'Imported test issue',
            body: 'Import body',
          },
        ],
      },
    });
    expect(JSON.parse((impRes as any).content[0].text).imported_count).toBe(1);

    // 11. use_blackboard (post, read)
    await client.callTool({
      name: 'use_blackboard',
      arguments: {
        action: 'post',
        project,
        topic: 'dispatch-test',
        content: 'hello from test',
      },
    });
    const bbRead = await client.callTool({
      name: 'use_blackboard',
      arguments: {
        action: 'read',
        project,
        topic: 'dispatch-test',
      },
    });
    expect(JSON.parse((bbRead as any).content[0].text).length).toBeGreaterThan(0);

    // 12. manage_specs (scaffold, compliance)
    const scafRes = await client.callTool({
      name: 'manage_specs',
      arguments: {
        action: 'scaffold',
        project,
        title: 'Dispatched Spec',
      },
    });
    expect(JSON.parse((scafRes as any).content[0].text).spec_node_id).toBeDefined();

    const compRes = await client.callTool({
      name: 'manage_specs',
      arguments: {
        action: 'compliance',
        project,
      },
    });
    expect(JSON.parse((compRes as any).content[0].text).total_specs).toBeGreaterThan(0);

    // 13. manage_database (audit, branch_diff)
    const dbRes = await client.callTool({
      name: 'manage_database',
      arguments: {
        action: 'audit',
        project,
      },
    });
    expect(JSON.parse((dbRes as any).content[0].text).sqlite_integrity).toBeDefined();

    const vcsRes = await client.callTool({
      name: 'manage_database',
      arguments: {
        action: 'branch_diff',
        project,
      },
    });
    expect(JSON.parse((vcsRes as any).content[0].text)).toBeDefined();
  });
});
