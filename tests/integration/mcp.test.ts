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
    // Clear integration test DB tables
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      {
        name: 'test-client',
        version: '0.0.6',
      },
      {
        capabilities: {},
      }
    );

    // Connect client and server in-process
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
    closeAllDbs();
  });

  it('should list available tools', async () => {
    const tools = await client.listTools();
    expect(tools.tools).toBeDefined();
    expect(tools.tools.length).toBe(81);

    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain('find_similar_blockers');
    expect(toolNames).toContain('auto_prune_stale_tasks');
    expect(toolNames).toContain('link_visual_state');
    expect(toolNames).toContain('export_joint_trajectories');
    expect(toolNames).toContain('get_synergy_metrics');
    expect(toolNames).toContain('natural_language_query');
    expect(toolNames).toContain('post_blackboard');
    expect(toolNames).toContain('read_blackboard');
    expect(toolNames).toContain('plan_and_decompose_feature');
    expect(toolNames).toContain('post_mortem_from_session');
    expect(toolNames).toContain('get_state_at_timestamp');
    expect(toolNames).toContain('revert_to_timestamp');
    expect(toolNames).toContain('validate_memory_references');
    expect(toolNames).toContain('velocity_analytics');
    expect(toolNames).toContain('burndown_chart');
    expect(toolNames).toContain('export_issues');
    expect(toolNames).toContain('import_issues');
    expect(toolNames).toContain('vcs_branch_sync');
    expect(toolNames).toContain('vcs_merge_resolution');
    expect(toolNames).toContain('compact_graph');
    expect(toolNames).toContain('archive_completed_nodes');
    expect(toolNames).toContain('doctor_report');
    expect(toolNames).toContain('watch_graph_changes');
    expect(toolNames).toContain('bootstrap_session');
    expect(toolNames).toContain('complete_task');
    expect(toolNames).toContain('ingest_spec');
    expect(toolNames).toContain('get_spec_compliance');
    expect(toolNames).toContain('batch_create_nodes');
    expect(toolNames).toContain('batch_add_edges');
    expect(toolNames).toContain('list_sessions');
    expect(toolNames).toContain('value_metrics');
    expect(toolNames).toContain('scaffold_template');
    expect(toolNames).toContain('add_node');

    expect(toolNames).toContain('update_node');
    expect(toolNames).toContain('get_node');
    expect(toolNames).toContain('remove_node');
    expect(toolNames).toContain('add_edge');
    expect(toolNames).toContain('remove_edge');
    expect(toolNames).toContain('list_nodes');
    expect(toolNames).toContain('search_nodes');
    expect(toolNames).toContain('get_subgraph');
    expect(toolNames).toContain('trace_dependencies');
    expect(toolNames).toContain('find_blockers');
    expect(toolNames).toContain('get_project_summary');
    expect(toolNames).toContain('decision_trail');
    expect(toolNames).toContain('critical_path');
    expect(toolNames).toContain('impact_analysis');
    expect(toolNames).toContain('detect_contradictions');
    expect(toolNames).toContain('export_graph');
    expect(toolNames).toContain('import_graph');
    expect(toolNames).toContain('query_graph');
    expect(toolNames).toContain('backup_project_db');
    expect(toolNames).toContain('restore_project_db');
    expect(toolNames).toContain('audit_project_db');
    expect(toolNames).toContain('merge_project_db');
    expect(toolNames).toContain('start_session');
    expect(toolNames).toContain('end_session');
    expect(toolNames).toContain('get_event_log');
    expect(toolNames).toContain('get_node_history');
    expect(toolNames).toContain('undo_last');
    expect(toolNames).toContain('save_snapshot');
    expect(toolNames).toContain('list_snapshots');
    expect(toolNames).toContain('diff_snapshots');
    expect(toolNames).toContain('export_trajectories');
  });

  it('should support nodes and edges operations via tools', async () => {
    // 1. Add Task Node
    const addNodeResult = await client.callTool({
      name: 'add_node',
      arguments: {
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
      name: 'add_node',
      arguments: {
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
      name: 'update_node',
      arguments: {
        project,
        id: node1.id,
        status: 'blocked',
        metadata: { estimate: '2h' },
      },
    });

    const updatedNode = JSON.parse((updateNodeResult as any).content[0].text);
    expect(updatedNode.status).toBe('blocked');
    expect(updatedNode.metadata.priority).toBe('high'); // Kept original
    expect(updatedNode.metadata.estimate).toBe('2h'); // Merged new

    // 4. Link Node and Blocker with Edge
    const addEdgeResult = await client.callTool({
      name: 'add_edge',
      arguments: {
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
      name: 'list_nodes',
      arguments: {
        project,
        type: 'task',
      },
    });

    const list = JSON.parse((listResult as any).content[0].text);
    expect(list.total_count).toBe(1);
    expect(list.nodes[0].id).toBe(node1.id);

    // 6. Search Nodes (FTS5)
    const searchResult = await client.callTool({
      name: 'search_nodes',
      arguments: {
        project,
        query: 'Setup',
      },
    });

    const search = JSON.parse((searchResult as any).content[0].text);
    expect(search.total_count).toBe(1);
    expect(search.nodes[0].title).toBe('Initial Database Setup');

    // 7. Find Blockers
    const blockersResult = await client.callTool({
      name: 'find_blockers',
      arguments: {
        project,
        node_id: node1.id,
      },
    });

    const blockersList = JSON.parse((blockersResult as any).content[0].text);
    expect(blockersList.length).toBe(1);
    expect(blockersList[0].blocker_node.id).toBe(blocker.id);

    // 8. Project Summary
    const summaryResult = await client.callTool({
      name: 'get_project_summary',
      arguments: { project },
    });

    const summary = JSON.parse((summaryResult as any).content[0].text);
    expect(summary.node_counts.task).toBe(1);
    expect(summary.node_counts.blocker).toBe(1);
    expect(summary.active_blockers.length).toBe(1);

    // 9. Remove Edge
    const removeEdgeResult = await client.callTool({
      name: 'remove_edge',
      arguments: {
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
      name: 'remove_node',
      arguments: {
        project,
        id: node1.id,
      },
    });

    const removeNodeResponse = JSON.parse((removeNodeResult as any).content[0].text);
    expect(removeNodeResponse.deleted_node_id).toBe(node1.id);
  });

  it('should return error for invalid tool arguments', async () => {
    const res = await client.callTool({
      name: 'add_node',
      arguments: {
        project,
        type: 'invalid-type',
        title: '',
      },
    });
    expect(res.isError).toBe(true);
  });
});
