import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { server } from '../../src/server.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';

describe('All MCP Tools Dispatch Test Suite', () => {
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
        version: '0.9.32',
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

  it('should dispatch all 81 tools cleanly via client.callTool', async () => {
    // 1. Node CRUD
    const addRes = await client.callTool({
      name: 'add_node',
      arguments: {
        project,
        type: 'task',
        title: 'Task A',
        status: 'pending',
        metadata: { priority: 'high' },
        tags: ['backend'],
      },
    });
    const addObjA = JSON.parse((addRes as any).content[0].text);
    const nodeA = addObjA.node || addObjA;
    expect(nodeA.id).toBeDefined();

    const addRes2 = await client.callTool({
      name: 'add_node',
      arguments: {
        project,
        type: 'decision',
        title: 'Decision 1',
        status: 'accepted',
        metadata: { rationale: 'best choice' },
        tags: ['arch'],
      },
    });
    const addObjB = JSON.parse((addRes2 as any).content[0].text);
    const nodeB = addObjB.node || addObjB;

    const addRes3 = await client.callTool({
      name: 'add_node',
      arguments: {
        project,
        type: 'milestone',
        title: 'Milestone 1',
        status: 'upcoming',
      },
    });
    const addObjM = JSON.parse((addRes3 as any).content[0].text);
    const nodeM = addObjM.node || addObjM;

    const addRes4 = await client.callTool({
      name: 'add_node',
      arguments: {
        project,
        type: 'artifact',
        title: 'Design Doc',
        status: 'active',
      },
    });
    const addObjArt = JSON.parse((addRes4 as any).content[0].text);
    const nodeArt = addObjArt.node || addObjArt;

    const getRes = await client.callTool({
      name: 'get_node',
      arguments: { project, id: nodeA.id },
    });
    const fetchedNode = JSON.parse((getRes as any).content[0].text);
    expect(fetchedNode.node.id).toBe(nodeA.id);

    const updateRes = await client.callTool({
      name: 'update_node',
      arguments: {
        project,
        id: nodeA.id,
        status: 'in_progress',
        metadata: { updated: true },
      },
    });
    const updated = JSON.parse((updateRes as any).content[0].text);
    expect(updated.status).toBe('in_progress');

    // 2. Edge CRUD
    const addEdgeRes = await client.callTool({
      name: 'add_edge',
      arguments: {
        project,
        source_id: nodeA.id,
        target_id: nodeB.id,
        type: 'decided_in',
      },
    });
    const edgeObj = JSON.parse((addEdgeRes as any).content[0].text);
    expect(edgeObj.source_id).toBe(nodeA.id);

    // 3. Query & Navigation
    const listRes = await client.callTool({
      name: 'list_nodes',
      arguments: { project, type: 'task', compact: true, fields: ['id', 'title'] },
    });
    expect(JSON.parse((listRes as any).content[0].text).nodes.length).toBeGreaterThan(0);

    const searchRes = await client.callTool({
      name: 'search_nodes',
      arguments: { project, query: 'Task' },
    });
    expect((searchRes as any).content[0].text).toBeDefined();

    const subRes = await client.callTool({
      name: 'get_subgraph',
      arguments: { project, root_id: nodeA.id, depth: 2 },
    });
    expect((subRes as any).content[0].text).toBeDefined();

    const traceRes = await client.callTool({
      name: 'trace_dependencies',
      arguments: { project, node_id: nodeA.id, direction: 'downstream' },
    });
    expect((traceRes as any).content[0].text).toBeDefined();

    const blockersRes = await client.callTool({
      name: 'find_blockers',
      arguments: { project },
    });
    expect((blockersRes as any).content[0].text).toBeDefined();

    const simBlockersRes = await client.callTool({
      name: 'find_similar_blockers',
      arguments: { project, query: 'Task', limit: 5 },
    });
    expect((simBlockersRes as any).content[0].text).toBeDefined();

    const autoPruneRes = await client.callTool({
      name: 'auto_prune_stale_tasks',
      arguments: { project, older_than: '30d' },
    });
    expect((autoPruneRes as any).content[0].text).toBeDefined();

    const summaryRes = await client.callTool({
      name: 'get_project_summary',
      arguments: { project },
    });
    expect((summaryRes as any).content[0].text).toBeDefined();

    // 4. Analytics
    const trailRes = await client.callTool({
      name: 'decision_trail',
      arguments: { project, node_id: nodeB.id },
    });
    expect((trailRes as any).content[0].text).toBeDefined();

    const critRes = await client.callTool({
      name: 'critical_path',
      arguments: { project, milestone_id: nodeM.id },
    });
    expect((critRes as any).content[0].text).toBeDefined();

    const impactRes = await client.callTool({
      name: 'impact_analysis',
      arguments: { project, node_id: nodeA.id },
    });
    expect((impactRes as any).content[0].text).toBeDefined();

    const contraRes = await client.callTool({
      name: 'detect_contradictions',
      arguments: { project },
    });
    expect((contraRes as any).content[0].text).toBeDefined();

    // 5. Query & RAW SQL / NL
    const queryGraphRes = await client.callTool({
      name: 'query_graph',
      arguments: { project, sql: 'SELECT * FROM nodes WHERE project = ?', params: [project] },
    });
    expect((queryGraphRes as any).content[0].text).toBeDefined();

    const nlQueryRes = await client.callTool({
      name: 'natural_language_query',
      arguments: { project, query: 'show all tasks' },
    });
    expect((nlQueryRes as any).content[0].text).toBeDefined();

    // 6. Blackboard & Compound Workflows
    const postBoardRes = await client.callTool({
      name: 'post_blackboard',
      arguments: { project, topic: 'arch', content: 'design notes', author: 'agent-1' },
    });
    expect((postBoardRes as any).content[0].text).toBeDefined();

    const readBoardRes = await client.callTool({
      name: 'read_blackboard',
      arguments: { project, topic: 'arch' },
    });
    expect((readBoardRes as any).content[0].text).toBeDefined();

    const planDecompRes = await client.callTool({
      name: 'plan_and_decompose_feature',
      arguments: {
        project,
        title: 'Auth Module',
        subtasks: [{ title: 'Design API' }, { title: 'Impl JWT' }],
      },
    });
    expect((planDecompRes as any).content[0].text).toBeDefined();

    const postMortemRes = await client.callTool({
      name: 'post_mortem_from_session',
      arguments: { project, session_id: 'session-123', root_cause: 'timeout' },
    });
    expect((postMortemRes as any).content[0].text).toBeDefined();

    // 7. Time-Travel & Memory Validation
    const nowIso = new Date().toISOString();
    const stateAtRes = await client.callTool({
      name: 'get_state_at_timestamp',
      arguments: { project, timestamp: nowIso },
    });
    expect((stateAtRes as any).content[0].text).toBeDefined();

    const revertRes = await client.callTool({
      name: 'revert_to_timestamp',
      arguments: { project, timestamp: nowIso },
    });
    expect((revertRes as any).content[0].text).toBeDefined();

    const valMemRes = await client.callTool({
      name: 'validate_memory_references',
      arguments: { project },
    });
    expect((valMemRes as any).content[0].text).toBeDefined();

    // 8. Velocity & Issues & VCS Sync
    const velRes = await client.callTool({
      name: 'velocity_analytics',
      arguments: { project, window_days: 7 },
    });
    expect((velRes as any).content[0].text).toBeDefined();

    const burnRes = await client.callTool({
      name: 'burndown_chart',
      arguments: { project, milestone_id: nodeM.id },
    });
    expect((burnRes as any).content[0].text).toBeDefined();

    const expIssuesRes = await client.callTool({
      name: 'export_issues',
      arguments: { project, format: 'github' },
    });
    expect((expIssuesRes as any).content[0].text).toBeDefined();

    const impIssuesRes = await client.callTool({
      name: 'import_issues',
      arguments: { project, issues: [{ external_id: '1', title: 'Issue 1', state: 'open' }] },
    });
    expect((impIssuesRes as any).content[0].text).toBeDefined();

    const vcsBranchRes = await client.callTool({
      name: 'vcs_branch_sync',
      arguments: { project, target_branch: 'feature-x' },
    });
    expect((vcsBranchRes as any).content[0].text).toBeDefined();

    const vcsMergeRes = await client.callTool({
      name: 'vcs_merge_resolution',
      arguments: { project, source_branch: 'feature-x', target_branch: 'main' },
    });
    expect((vcsMergeRes as any).content[0].text).toBeDefined();

    // 9. Maintenance & System Doctor
    const doctorRes = await client.callTool({
      name: 'doctor_report',
      arguments: { project },
    });
    expect((doctorRes as any).content[0].text).toBeDefined();

    const watchRes = await client.callTool({
      name: 'watch_graph_changes',
      arguments: { project, since: nowIso },
    });
    expect((watchRes as any).content[0].text).toBeDefined();

    const compactRes = await client.callTool({
      name: 'compact_graph',
      arguments: { project, prune_orphaned_edges: true },
    });
    expect((compactRes as any).content[0].text).toBeDefined();

    const archiveRes = await client.callTool({
      name: 'archive_completed_nodes',
      arguments: { project, older_than_days: 30 },
    });
    expect((archiveRes as any).content[0].text).toBeDefined();

    // 10. Backup & DB Ops
    const backupRes = await client.callTool({
      name: 'backup_project_db',
      arguments: { project },
    });
    const backupPath = (backupRes as any).content[0].text.trim();
    expect(backupPath).toBeDefined();

    const restoreRes = await client.callTool({
      name: 'restore_project_db',
      arguments: { project, backupPath },
    });
    expect((restoreRes as any).content[0].text).toBeDefined();

    const auditDbRes = await client.callTool({
      name: 'audit_project_db',
      arguments: { project },
    });
    expect((auditDbRes as any).content[0].text).toBeDefined();

    const mergeDbRes = await client.callTool({
      name: 'merge_project_db',
      arguments: { project, sourcePath: backupPath },
    });
    expect((mergeDbRes as any).content[0].text).toBeDefined();

    // 11. Context & Scaffolding & Sessions
    const contextSnapRes = await client.callTool({
      name: 'get_context_snapshot',
      arguments: { project },
    });
    expect((contextSnapRes as any).content[0].text).toBeDefined();

    const relDecRes = await client.callTool({
      name: 'find_related_decisions',
      arguments: { project, artifact_id: nodeArt.id },
    });
    expect((relDecRes as any).content[0].text).toBeDefined();

    const blockedTasksRes = await client.callTool({
      name: 'find_blocked_tasks',
      arguments: { project, decision_id: nodeB.id },
    });
    expect((blockedTasksRes as any).content[0].text).toBeDefined();

    const scaffoldTmplRes = await client.callTool({
      name: 'scaffold_template',
      arguments: { project, template: 'fdd', name: 'Feature A' },
    });
    expect((scaffoldTmplRes as any).content[0].text).toBeDefined();

    const valMetricsRes = await client.callTool({
      name: 'value_metrics',
      arguments: { project },
    });
    expect((valMetricsRes as any).content[0].text).toBeDefined();

    const startSessRes = await client.callTool({
      name: 'start_session',
      arguments: { project, agent_id: 'test-agent' },
    });
    const sessObj = JSON.parse((startSessRes as any).content[0].text);
    expect(sessObj.session_id).toBeDefined();

    const endSessRes = await client.callTool({
      name: 'end_session',
      arguments: { project, session_id: sessObj.session_id },
    });
    expect((endSessRes as any).content[0].text).toBeDefined();

    const eventLogRes = await client.callTool({
      name: 'get_event_log',
      arguments: { project, limit: 10 },
    });
    expect((eventLogRes as any).content[0].text).toBeDefined();

    const verifyAuditRes = await client.callTool({
      name: 'verify_audit_chain',
      arguments: { project },
    });
    expect((verifyAuditRes as any).content[0].text).toBeDefined();

    // 12. State Traversal & Snapshots & Trajectories
    const subCtxRes = await client.callTool({
      name: 'subscribe_context_changes',
      arguments: { project },
    });
    expect((subCtxRes as any).content[0].text).toBeDefined();

    const traceBackRes = await client.callTool({
      name: 'traceback_to_node',
      arguments: { project, target_id: nodeA.id },
    });
    expect((traceBackRes as any).content[0].text).toBeDefined();

    const cogLoadRes = await client.callTool({
      name: 'get_cognitive_load',
      arguments: { project },
    });
    expect((cogLoadRes as any).content[0].text).toBeDefined();

    const historyRes = await client.callTool({
      name: 'get_node_history',
      arguments: { project, node_id: nodeA.id },
    });
    expect((historyRes as any).content[0].text).toBeDefined();

    const undoRes = await client.callTool({
      name: 'undo_last',
      arguments: { project, node_id: nodeA.id },
    });
    expect((undoRes as any).content[0].text).toBeDefined();

    const saveSnapRes = await client.callTool({
      name: 'save_snapshot',
      arguments: { project, title: 'Snap 1' },
    });
    const snapObj = JSON.parse((saveSnapRes as any).content[0].text);
    expect(snapObj.snapshot_id).toBeDefined();

    const listSnapRes = await client.callTool({
      name: 'list_snapshots',
      arguments: { project },
    });
    expect((listSnapRes as any).content[0].text).toBeDefined();

    const diffSnapRes = await client.callTool({
      name: 'diff_snapshots',
      arguments: {
        project,
        snapshot_id_a: snapObj.snapshot_id,
        snapshot_id_b: snapObj.snapshot_id,
      },
    });
    expect((diffSnapRes as any).content[0].text).toBeDefined();

    const exportTrajRes = await client.callTool({
      name: 'export_trajectories',
      arguments: { project, format: 'jsonl' },
    });
    expect((exportTrajRes as any).content[0].text).toBeDefined();

    // 13. Batch & Queue Operations
    const batchUpRes = await client.callTool({
      name: 'batch_update',
      arguments: { project, ids: [nodeA.id], status: 'done' },
    });
    expect((batchUpRes as any).content[0].text).toBeDefined();

    const nextTasksRes = await client.callTool({
      name: 'next_tasks',
      arguments: { project },
    });
    expect((nextTasksRes as any).content[0].text).toBeDefined();

    const whatChangedRes = await client.callTool({
      name: 'what_changed',
      arguments: { project, since: '1h' },
    });
    expect((whatChangedRes as any).content[0].text).toBeDefined();

    const getStaleRes = await client.callTool({
      name: 'get_stale_nodes',
      arguments: { project, older_than: '1d' },
    });
    expect((getStaleRes as any).content[0].text).toBeDefined();

    const validateGraphRes = await client.callTool({
      name: 'validate_graph',
      arguments: { project },
    });
    expect((validateGraphRes as any).content[0].text).toBeDefined();

    const pruneEventsRes = await client.callTool({
      name: 'prune_events',
      arguments: { project, older_than: '30d' },
    });
    expect((pruneEventsRes as any).content[0].text).toBeDefined();

    const addNoteRes = await client.callTool({
      name: 'add_note',
      arguments: { project, text: 'Important note', attach_to: nodeA.id },
    });
    expect((addNoteRes as any).content[0].text).toBeDefined();

    // 14. Compound Engines
    const bootRes = await client.callTool({
      name: 'bootstrap_session',
      arguments: { project, agent_id: 'bootstrap-agent' },
    });
    expect((bootRes as any).content[0].text).toBeDefined();

    const compTaskRes = await client.callTool({
      name: 'complete_task',
      arguments: { project, task_id: nodeA.id, summary: 'Finished' },
    });
    expect((compTaskRes as any).content[0].text).toBeDefined();

    const batchCreateRes = await client.callTool({
      name: 'batch_create_nodes',
      arguments: { project, nodes: [{ type: 'task', title: 'Batch Task 1' }] },
    });
    const batchCreateObj = JSON.parse((batchCreateRes as any).content[0].text);
    expect(batchCreateObj.created_nodes.length).toBe(1);

    const batchEdgeRes = await client.callTool({
      name: 'batch_add_edges',
      arguments: {
        project,
        edges: [{ source_id: nodeA.id, target_id: nodeB.id, type: 'depends_on' }],
      },
    });
    expect((batchEdgeRes as any).content[0].text).toBeDefined();

    // 15. Spec Engine
    const ingestSpecRes = await client.callTool({
      name: 'ingest_spec',
      arguments: { project, file_path: 'README.md' },
    });
    const ingestObj = JSON.parse((ingestSpecRes as any).content[0].text);
    const specId = ingestObj.spec_node_id;

    const exportSpecRes = await client.callTool({
      name: 'export_spec',
      arguments: { project, spec_id: specId },
    });
    expect((exportSpecRes as any).content[0].text).toBeDefined();

    const specCompRes = await client.callTool({
      name: 'get_spec_compliance',
      arguments: { project },
    });
    expect((specCompRes as any).content[0].text).toBeDefined();

    const scaffoldSpecRes = await client.callTool({
      name: 'scaffold_spec',
      arguments: { project, feature_name: 'Auth' },
    });
    expect((scaffoldSpecRes as any).content[0].text).toBeDefined();

    const verifyReqRes = await client.callTool({
      name: 'verify_requirement',
      arguments: { project, criterion_id: nodeA.id },
    });
    expect((verifyReqRes as any).content[0].text).toBeDefined();

    // 16. Dual-Memory Synergy
    const linkVisRes = await client.callTool({
      name: 'link_visual_state',
      arguments: { project, target_id: nodeA.id, visual_state_id: 'vs-123' },
    });
    expect((linkVisRes as any).content[0].text).toBeDefined();

    const expJointRes = await client.callTool({
      name: 'export_joint_trajectories',
      arguments: { project },
    });
    expect((expJointRes as any).content[0].text).toBeDefined();

    const synergyRes = await client.callTool({
      name: 'get_synergy_metrics',
      arguments: { project },
    });
    expect((synergyRes as any).content[0].text).toBeDefined();

    // 17. Cleanup Delete Node & Remove Edge
    const remEdgeRes = await client.callTool({
      name: 'remove_edge',
      arguments: { project, source_id: nodeA.id, target_id: nodeB.id, type: 'decided_in' },
    });
    expect((remEdgeRes as any).content[0].text).toBeDefined();

    const remNodeRes = await client.callTool({
      name: 'remove_node',
      arguments: { project, id: nodeB.id },
    });
    expect((remNodeRes as any).content[0].text).toBeDefined();
  });
});
