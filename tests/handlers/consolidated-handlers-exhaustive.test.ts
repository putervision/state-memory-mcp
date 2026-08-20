import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { analyticsHandlers } from '../../src/handlers/analytics.js';
import { snapshotHandlers } from '../../src/handlers/snapshot.js';
import { specHandlers } from '../../src/handlers/spec.js';
import { graphHandlers } from '../../src/handlers/graph.js';
import { sessionHandlers } from '../../src/handlers/session.js';
import { batchHandlers } from '../../src/handlers/batch.js';
import { nodeHandlers } from '../../src/handlers/node.js';
import { edgeHandlers } from '../../src/handlers/edge.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';

describe('State Memory Consolidated Handlers Exhaustive Test Suite', () => {
  const project = 'handlers-exhaustive-test';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
    db.prepare('DELETE FROM sessions WHERE project = ?').run(project);
    db.prepare('DELETE FROM events WHERE project = ?').run(project);
    db.prepare('DELETE FROM snapshots WHERE project = ?').run(project);
    db.prepare('DELETE FROM blackboard WHERE project = ?').run(project);
  });

  afterAll(() => {
    closeAllDbs();
  });

  describe('analyticsHandlers.get_analytics & run_diagnostics', () => {
    it('should throw on missing or invalid action', () => {
      expect(() => analyticsHandlers.get_analytics({})).toThrow('Parameter "action" is required');
      expect(() => analyticsHandlers.get_analytics({ action: 'invalid_action' })).toThrow(
        'Invalid action'
      );
      expect(() => analyticsHandlers.run_diagnostics({})).toThrow('Parameter "action" is required');
      expect(() => analyticsHandlers.run_diagnostics({ action: 'invalid_action' })).toThrow(
        'Invalid action'
      );
    });

    it('should handle all get_analytics actions', () => {
      // Seed data
      const m1 = GraphEngine.addNode({
        project,
        type: 'milestone',
        title: 'Milestone 1',
        status: 'pending',
      });
      const a1 = GraphEngine.addNode({
        project,
        type: 'artifact',
        title: 'Artifact 1',
        status: 'current',
      });
      const n1 = GraphEngine.addNode({ project, type: 'task', title: 'Task 1', status: 'done' });
      const n2 = GraphEngine.addNode({
        project,
        type: 'task',
        title: 'Task 2',
        status: 'in_progress',
      });
      const n3 = GraphEngine.addNode({
        project,
        type: 'blocker',
        title: 'Blocker 1',
        status: 'active',
      });
      const d1 = GraphEngine.addNode({
        project,
        type: 'decision',
        title: 'Decision 1',
        status: 'accepted',
      });
      EdgeEngine.addEdge({ project, source_id: n2.id, target_id: n1.id, type: 'depends_on' });
      EdgeEngine.addEdge({ project, source_id: n3.id, target_id: n2.id, type: 'blocks' });
      EdgeEngine.addEdge({ project, source_id: n1.id, target_id: d1.id, type: 'decided_in' });
      EdgeEngine.addEdge({ project, source_id: n1.id, target_id: m1.id, type: 'part_of' });
      EdgeEngine.addEdge({ project, source_id: d1.id, target_id: a1.id, type: 'references' });

      expect(analyticsHandlers.get_analytics({ action: 'summary', project })).toBeDefined();
      expect(analyticsHandlers.get_analytics({ action: 'velocity', project })).toBeDefined();
      expect(analyticsHandlers.get_analytics({ action: 'burndown', project })).toBeDefined();
      expect(analyticsHandlers.get_analytics({ action: 'value_metrics', project })).toBeDefined();
      expect(analyticsHandlers.get_analytics({ action: 'cognitive_load', project })).toBeDefined();
      expect(
        analyticsHandlers.get_analytics({ action: 'critical_path', project, milestone_id: m1.id })
      ).toBeDefined();
      expect(
        analyticsHandlers.get_analytics({
          action: 'context_snapshot',
          project,
          focus_node_id: n2.id,
        })
      ).toBeDefined();
      expect(
        analyticsHandlers.get_analytics({ action: 'decision_trail', project, node_id: d1.id })
      ).toBeDefined();
      expect(
        analyticsHandlers.get_analytics({
          action: 'find_related_decisions',
          project,
          artifact_id: a1.id,
        })
      ).toBeDefined();
      expect(analyticsHandlers.get_analytics({ action: 'contradictions', project })).toBeDefined();
    });

    it('should handle all run_diagnostics actions', () => {
      expect(analyticsHandlers.run_diagnostics({ action: 'validate', project })).toBeDefined();
      expect(analyticsHandlers.run_diagnostics({ action: 'doctor', project })).toBeDefined();
      expect(analyticsHandlers.run_diagnostics({ action: 'check_refs', project })).toBeDefined();
      expect(analyticsHandlers.run_diagnostics({ action: 'audit_chain', project })).toBeDefined();
      expect(analyticsHandlers.run_diagnostics({ action: 'compact', project })).toBeDefined();
      expect(
        analyticsHandlers.run_diagnostics({ action: 'archive', project, older_than_days: 30 })
      ).toBeDefined();
      expect(
        analyticsHandlers.run_diagnostics({
          action: 'prune_events',
          project,
          older_than: '30d',
          dry_run: true,
        })
      ).toBeDefined();
      expect(analyticsHandlers.run_diagnostics({ action: 'version', project })).toBeDefined();
    });
  });

  describe('snapshotHandlers.manage_snapshots & manage_data', () => {
    it('should throw on missing or invalid action', async () => {
      expect(() => snapshotHandlers.manage_snapshots({})).toThrow('Parameter "action" is required');
      expect(() => snapshotHandlers.manage_snapshots({ action: 'unknown' })).toThrow(
        'Invalid action'
      );
      await expect(async () => await snapshotHandlers.manage_data({})).rejects.toThrow(
        'Parameter "action" is required'
      );
      await expect(
        async () => await snapshotHandlers.manage_data({ action: 'unknown' })
      ).rejects.toThrow('Invalid action');
    });

    it('should handle save, list, diff, get_state, revert, undo, get_history', () => {
      const n1 = GraphEngine.addNode({ project, type: 'task', title: 'Task 1', status: 'pending' });

      // Save snap 1
      const s1 = snapshotHandlers.manage_snapshots({ action: 'save', project, force: true }) as any;
      expect(s1.snapshot_id).toBeDefined();

      // List
      const list = snapshotHandlers.manage_snapshots({ action: 'list', project });
      expect(Array.isArray(list)).toBe(true);

      // Modify and save snap 2
      GraphEngine.updateNode({ project, id: n1.id, status: 'done' });
      const s2 = snapshotHandlers.manage_snapshots({ action: 'save', project, force: true }) as any;

      // Diff
      const diff = snapshotHandlers.manage_snapshots({
        action: 'diff',
        project,
        snapshot_id_a: s1.snapshot_id,
        snapshot_id_b: s2.snapshot_id,
      });
      expect(diff).toBeDefined();

      // Get state
      const state = snapshotHandlers.manage_snapshots({
        action: 'get_state',
        project,
        timestamp: new Date().toISOString(),
      });
      expect(state).toBeDefined();

      // Revert
      const revert = snapshotHandlers.manage_snapshots({
        action: 'revert',
        project,
        timestamp: new Date().toISOString(),
      });
      expect(revert).toBeDefined();

      // Undo
      const undo = snapshotHandlers.manage_snapshots({ action: 'undo', project, node_id: n1.id });
      expect(undo).toBeDefined();

      // Get history
      const hist = snapshotHandlers.manage_snapshots({
        action: 'get_history',
        project,
        node_id: n1.id,
      });
      expect(hist).toBeDefined();
    });

    it('should handle manage_data actions', async () => {
      const expGraph = await snapshotHandlers.manage_data({
        action: 'export_graph',
        project,
        format: 'json',
      });
      expect(expGraph).toBeDefined();

      const expIssues = await snapshotHandlers.manage_data({
        action: 'export_issues',
        project,
        format: 'github',
      });
      expect(expIssues).toBeDefined();

      const expTraj = await snapshotHandlers.manage_data({
        action: 'export_trajectories',
        project,
      });
      expect(expTraj).toBeDefined();

      const expJoint = await snapshotHandlers.manage_data({
        action: 'export_joint_trajectories',
        project,
      });
      expect(expJoint).toBeDefined();

      const expSynergy = await snapshotHandlers.manage_data({
        action: 'export_synergy_metrics',
        project,
      });
      expect(expSynergy).toBeDefined();

      const impGraph = await snapshotHandlers.manage_data({
        action: 'import_graph',
        project,
        data: { nodes: [{ type: 'task', title: 'Imported Task', status: 'pending' }], edges: [] },
      });
      expect(impGraph).toBeDefined();

      const impIssues = await snapshotHandlers.manage_data({
        action: 'import_issues',
        project,
        issues: [{ external_id: 'GH-101', title: 'GitHub Issue 101' }],
      });
      expect(impIssues).toBeDefined();

      const impSpec = await snapshotHandlers.manage_data({
        action: 'import_spec',
        project,
        file_path: 'package.json',
      });
      expect(impSpec).toBeDefined();
    });
  });

  describe('specHandlers.manage_specs', () => {
    it('should throw on missing or invalid action', () => {
      expect(() => specHandlers.manage_specs({})).toThrow('Parameter "action" is required');
      expect(() => specHandlers.manage_specs({ action: 'unknown' })).toThrow('Invalid action');
    });

    it('should handle scaffold, export, compliance, verify, decompose_feature, template', () => {
      const scaffold = specHandlers.manage_specs({
        action: 'scaffold',
        project,
        title: 'Auth Feature Spec',
      });
      expect(scaffold).toBeDefined();

      const comp = specHandlers.manage_specs({ action: 'compliance', project });
      expect(comp).toBeDefined();

      const crit = GraphEngine.addNode({
        project,
        type: 'acceptance_criterion',
        title: 'Returns 200 on login',
      });
      const ver = specHandlers.manage_specs({
        action: 'verify',
        project,
        criterion_id: crit.id,
        passed: true,
        evidence: 'Integration test passed',
      });
      expect(ver).toBeDefined();

      const decomp = specHandlers.manage_specs({
        action: 'decompose_feature',
        project,
        title: 'Payment Module',
        subtasks: [{ title: 'Charge card successfully' }],
      });
      expect(decomp).toBeDefined();

      const tmpl = specHandlers.manage_specs({
        action: 'template',
        template: 'rfc',
        name: 'AuthRFC',
      });
      expect(tmpl).toBeDefined();
    });
  });

  describe('graphHandlers.query_graph, manage_database & use_blackboard', () => {
    it('should throw on missing or invalid action', async () => {
      await expect(async () => await graphHandlers.query_graph({})).rejects.toThrow(
        'Parameter "action" is required'
      );
      await expect(
        async () => await graphHandlers.query_graph({ action: 'unknown' })
      ).rejects.toThrow('Invalid action');
      expect(() => graphHandlers.manage_database({})).toThrow('Parameter "action" is required');
      expect(() => graphHandlers.manage_database({ action: 'unknown' })).toThrow('Invalid action');
      expect(() => graphHandlers.use_blackboard({})).toThrow('Parameter "action" is required');
      expect(() => graphHandlers.use_blackboard({ action: 'unknown' })).toThrow('Invalid action');
    });

    it('should handle subgraph, trace, raw, natural_language', async () => {
      const n1 = GraphEngine.addNode({ project, type: 'task', title: 'Task A', status: 'pending' });
      const n2 = GraphEngine.addNode({ project, type: 'task', title: 'Task B', status: 'pending' });
      EdgeEngine.addEdge({ project, source_id: n2.id, target_id: n1.id, type: 'depends_on' });

      const sub = await graphHandlers.query_graph({
        action: 'subgraph',
        project,
        root_id: n2.id,
        depth: 2,
      });
      expect(sub).toBeDefined();

      const trace = await graphHandlers.query_graph({
        action: 'trace',
        project,
        node_id: n2.id,
        direction: 'downstream',
      });
      expect(trace).toBeDefined();

      const raw = await graphHandlers.query_graph({
        action: 'raw',
        project,
        sql: 'SELECT * FROM nodes WHERE project = ?',
        params: [project],
      });
      expect(Array.isArray(raw)).toBe(true);

      const nl = await graphHandlers.query_graph({
        action: 'natural_language',
        project,
        query: 'show pending tasks',
      });
      expect(nl).toBeDefined();
    });

    it('should handle manage_database and use_blackboard actions', () => {
      const aud = graphHandlers.manage_database({ action: 'audit', project });
      expect(aud).toBeDefined();

      const post = graphHandlers.use_blackboard({
        action: 'post',
        project,
        topic: 'releases',
        content: '1.0.0 released',
      });
      expect(post).toBeDefined();

      const read = graphHandlers.use_blackboard({ action: 'read', project, topic: 'releases' });
      expect(read).toBeDefined();
    });
  });

  describe('sessionHandlers.manage_sessions & get_events', () => {
    it('should throw on missing or invalid action', () => {
      expect(() => sessionHandlers.manage_sessions({})).toThrow('Parameter "action" is required');
      expect(() => sessionHandlers.manage_sessions({ action: 'unknown' })).toThrow(
        'Invalid action'
      );
      expect(() => sessionHandlers.get_events({})).toThrow('Parameter "action" is required');
      expect(() => sessionHandlers.get_events({ action: 'unknown' })).toThrow('Invalid action');
    });

    it('should handle start, list, end, bootstrap and get_events', () => {
      const start = sessionHandlers.manage_sessions({
        action: 'start',
        project,
        agent_id: 'test-agent',
      }) as any;
      expect(start.session_id).toBeDefined();

      const list = sessionHandlers.manage_sessions({ action: 'list', project });
      expect(Array.isArray(list)).toBe(true);

      const boot = sessionHandlers.manage_sessions({
        action: 'bootstrap',
        project,
        agent_id: 'test-agent',
      });
      expect(boot).toBeDefined();

      const log = sessionHandlers.get_events({ action: 'log', project, limit: 10 });
      expect(log).toBeDefined();

      const changelog = sessionHandlers.get_events({ action: 'changelog', project, since: '1h' });
      expect(changelog).toBeDefined();

      const postMortem = sessionHandlers.get_events({
        action: 'post_mortem',
        project,
        session_id: start.session_id,
      });
      expect(postMortem).toBeDefined();

      const end = sessionHandlers.manage_sessions({
        action: 'end',
        project,
        session_id: start.session_id,
      }) as any;
      expect(end.success).toBe(true);
    });
  });

  describe('batchHandlers.manage_tasks', () => {
    it('should handle next, complete, find_blocked, find_stale, find_blockers, find_similar_blockers, auto_prune', () => {
      const d1 = GraphEngine.addNode({
        project,
        type: 'decision',
        title: 'Dec 1',
        status: 'proposed',
      });
      const t1 = GraphEngine.addNode({
        project,
        type: 'task',
        title: 'Task Next 1',
        status: 'pending',
      });
      const b1 = GraphEngine.addNode({
        project,
        type: 'blocker',
        title: 'Blocker Task Next',
        status: 'active',
      });
      EdgeEngine.addEdge({ project, source_id: b1.id, target_id: t1.id, type: 'blocks' });

      expect(batchHandlers.manage_tasks({ action: 'next', project })).toBeDefined();
      expect(
        batchHandlers.manage_tasks({ action: 'find_blocked', project, decision_id: d1.id })
      ).toBeDefined();
      expect(
        batchHandlers.manage_tasks({ action: 'find_blockers', project, task_id: t1.id })
      ).toBeDefined();
      expect(
        batchHandlers.manage_tasks({
          action: 'find_similar_blockers',
          project,
          query: 'Network error',
        })
      ).toBeDefined();
      expect(
        batchHandlers.manage_tasks({ action: 'find_stale', project, older_than: '30d' })
      ).toBeDefined();
      expect(
        batchHandlers.manage_tasks({
          action: 'auto_prune',
          project,
          older_than: '30d',
          dry_run: true,
        })
      ).toBeDefined();
      expect(
        batchHandlers.manage_tasks({ action: 'complete', project, task_id: t1.id })
      ).toBeDefined();
    });
  });

  describe('nodeHandlers.manage_nodes & edgeHandlers.manage_edges', () => {
    it('should handle batch create, batch update, CRUD, and links', async () => {
      const bCreate = (await nodeHandlers.manage_nodes({
        action: 'batch_create',
        project,
        nodes: [
          { type: 'task', title: 'Batch Task 1', status: 'pending' },
          { type: 'task', title: 'Batch Task 2', status: 'pending' },
        ],
      })) as any;
      expect(bCreate.created_nodes.length).toBe(2);

      const bUpdate = (await nodeHandlers.manage_nodes({
        action: 'batch_update',
        project,
        ids: bCreate.created_nodes.map((n: any) => n.id),
        status: 'done',
      })) as any;
      expect(bUpdate.updated).toBe(2);

      const bEdge = (await edgeHandlers.manage_edges({
        action: 'batch_add',
        project,
        edges: [
          {
            source_id: bCreate.created_nodes[0].id,
            target_id: bCreate.created_nodes[1].id,
            type: 'depends_on',
          },
        ],
      })) as any;
      expect(bEdge.created_edges.length).toBe(1);

      const created = (await nodeHandlers.manage_nodes({
        action: 'create',
        project,
        type: 'task',
        title: 'Single Task',
        status: 'pending',
      })) as any;
      expect(created.id).toBeDefined();

      const fetched = (await nodeHandlers.manage_nodes({
        action: 'get',
        project,
        id: created.id,
      })) as any;
      expect(fetched.node.id).toBe(created.id);

      const listed = (await nodeHandlers.manage_nodes({
        action: 'list',
        project,
        type: 'task',
      })) as any;
      expect(listed.nodes.length).toBeGreaterThan(0);

      const searched = (await nodeHandlers.manage_nodes({
        action: 'search',
        project,
        query: 'Single',
      })) as any;
      expect(searched.nodes.length).toBeGreaterThan(0);

      const noted = (await nodeHandlers.manage_nodes({
        action: 'add_note',
        project,
        text: 'Note test',
        attach_to: created.id,
      })) as any;
      expect(noted.id).toBeDefined();

      const updated = (await nodeHandlers.manage_nodes({
        action: 'update',
        project,
        id: created.id,
        status: 'done',
      })) as any;
      expect(updated.status).toBe('done');

      const linked = (await edgeHandlers.manage_edges({
        action: 'link_visual',
        project,
        target_id: created.id,
        visual_state_id: 'vs_test_01',
        relationship: 'renders_state',
      })) as any;
      expect(linked.success).toBe(true);

      const removedEdge = (await edgeHandlers.manage_edges({
        action: 'remove',
        project,
        source_id: linked.source_id,
        target_id: linked.target_id,
        type: 'renders_state',
      })) as any;
      expect(removedEdge.removed).toBe(true);

      const removed = (await nodeHandlers.manage_nodes({
        action: 'remove',
        project,
        id: created.id,
      })) as any;
      expect(removed.deleted_node_id).toBe(created.id);
    });
  });
});
