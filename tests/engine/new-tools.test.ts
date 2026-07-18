import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { EventEngine } from '../../src/engine/events.js';
import { SessionEngine } from '../../src/engine/sessions.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';
import { batchUpdate } from '../../src/engine/batch.js';
import { getNextTasks } from '../../src/engine/work-queue.js';
import { getChanges } from '../../src/engine/changeset.js';
import { getStaleNodes, parseDuration, formatDuration } from '../../src/engine/staleness.js';
import { validateGraph } from '../../src/engine/validate.js';

describe('v0.4.0 New Agent Tools Tests', () => {
  const project = 'new-tools-test-project';

  beforeAll(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges').run();
    db.prepare('DELETE FROM events').run();
    db.prepare('DELETE FROM sessions').run();
    db.prepare('DELETE FROM nodes').run();
  });

  afterAll(() => {
    closeAllDbs();
  });

  describe('batchUpdate', () => {
    it('should bulk update multiple nodes in a single transaction', () => {
      const db = getDb(project);

      const n1 = GraphEngine.addNode({
        project,
        type: 'task',
        title: 'Task 1',
        status: 'pending',
      });
      const n2 = GraphEngine.addNode({
        project,
        type: 'task',
        title: 'Task 2',
        status: 'pending',
      });

      const res = batchUpdate(db, {
        project,
        ids: [n1.id, n2.id],
        status: 'in_progress',
        tags: ['batch-test'],
        metadata: { batch: true },
      });

      expect(res.updated).toBe(2);
      expect(res.failed.length).toBe(0);

      const updatedN1 = GraphEngine.getNode({ project, id: n1.id });
      const updatedN2 = GraphEngine.getNode({ project, id: n2.id });

      expect(updatedN1?.node.status).toBe('in_progress');
      expect(updatedN1?.node.tags).toContain('batch-test');
      expect(updatedN1?.node.metadata.batch).toBe(true);

      expect(updatedN2?.node.status).toBe('in_progress');
      expect(updatedN2?.node.tags).toContain('batch-test');
      expect(updatedN2?.node.metadata.batch).toBe(true);
    });

    it('should report failed updates for non-existent nodes', () => {
      const db = getDb(project);
      const res = batchUpdate(db, {
        project,
        ids: ['non-existent-id'],
        status: 'done',
      });
      expect(res.updated).toBe(0);
      expect(res.failed.length).toBe(1);
      expect(res.failed[0].id).toBe('non-existent-id');
      expect(res.failed[0].reason).toContain('Node not found');
    });
  });

  describe('next_tasks', () => {
    it('should retrieve unblocked pending/in_progress tasks prioritised by blocks count', () => {
      const db = getDb(project);
      db.prepare('DELETE FROM edges').run();
      db.prepare('DELETE FROM nodes').run();

      // Setup:
      // T1 (blocks T2)
      // T2 (blocks T3)
      // T3 (leaf)
      // T4 (unblocked independent)
      const t1 = GraphEngine.addNode({ project, type: 'task', title: 'T1', status: 'pending' });
      const t2 = GraphEngine.addNode({ project, type: 'task', title: 'T2', status: 'pending' });
      const t3 = GraphEngine.addNode({ project, type: 'task', title: 'T3', status: 'pending' });
      const t4 = GraphEngine.addNode({ project, type: 'task', title: 'T4', status: 'pending' });

      EdgeEngine.addEdge({ project, source_id: t1.id, target_id: t2.id, type: 'blocks' });
      EdgeEngine.addEdge({ project, source_id: t2.id, target_id: t3.id, type: 'blocks' });

      const res = getNextTasks(db, { project });

      // Unblocked tasks are T1 (blocks T2) and T4 (blocks nothing).
      // T1 blocks 1 node, T4 blocks 0. So T1 must be sorted first!
      expect(res.tasks.length).toBe(2);
      expect(res.tasks[0].node.id).toBe(t1.id);
      expect(res.tasks[0].priority_reason).toContain('blocking 1');

      expect(res.tasks[1].node.id).toBe(t4.id);
      expect(res.tasks[1].priority_reason).toBe('unblocked');

      expect(res.summary).toContain('2 unblocked tasks, 1 blocking others');
    });
  });

  describe('what_changed', () => {
    it('should diff nodes and edges modified since a session start', () => {
      const db = getDb(project);
      db.prepare('DELETE FROM edges').run();
      db.prepare('DELETE FROM events').run();
      db.prepare('DELETE FROM sessions').run();
      db.prepare('DELETE FROM nodes').run();

      const { session_id } = SessionEngine.startSession(db, { project });

      // Create a node and edge
      const n1 = GraphEngine.addNode({
        project,
        type: 'task',
        title: 'Changeset Task',
        status: 'pending',
      });
      const n2 = GraphEngine.addNode({
        project,
        type: 'decision',
        title: 'Changeset Decision',
        status: 'accepted',
      });
      const edge = EdgeEngine.addEdge({
        project,
        source_id: n1.id,
        target_id: n2.id,
        type: 'decided_in',
      });

      const changes = getChanges(db, { project, since_session: session_id });

      expect(changes.nodes_created.length).toBe(2);
      expect(changes.decisions_made.length).toBe(1);
      expect(changes.decisions_made[0].id).toBe(n2.id);
      expect(changes.edges_created.length).toBe(1);
      expect(changes.edges_created[0].id).toBe(edge.id);
      expect(changes.summary).toContain('2 created, 1 decisions accepted');
    });
  });

  describe('staleness', () => {
    it('should parse duration correctly', () => {
      expect(parseDuration('30s')).toBe(30 * 1000);
      expect(parseDuration('15m')).toBe(15 * 60 * 1000);
      expect(parseDuration('2h')).toBe(2 * 60 * 60 * 1000);
      expect(parseDuration('5d')).toBe(5 * 24 * 60 * 60 * 1000);
      expect(parseDuration('2w')).toBe(2 * 7 * 24 * 60 * 60 * 1000);
    });

    it('should format duration human-readably', () => {
      expect(formatDuration(45 * 1000)).toBe('45 seconds');
      expect(formatDuration(5 * 60 * 1000)).toBe('5 minutes');
      expect(formatDuration(3 * 60 * 60 * 1000)).toBe('3 hours');
      expect(formatDuration(4 * 24 * 60 * 60 * 1000)).toBe('4 days');
      expect(formatDuration(3 * 7 * 24 * 60 * 60 * 1000)).toBe('3 weeks');
    });

    it('should identify idle/stale nodes', () => {
      const db = getDb(project);
      db.prepare('DELETE FROM edges').run();
      db.prepare('DELETE FROM nodes').run();

      const n1 = GraphEngine.addNode({
        project,
        type: 'task',
        title: 'Stale Task',
        status: 'in_progress',
      });

      // Update its updated_at to 10 days ago
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare('UPDATE nodes SET updated_at = ? WHERE id = ?').run(tenDaysAgo, n1.id);

      const stale = getStaleNodes(db, { project, older_than: '5d', status: 'in_progress' });
      expect(stale.count).toBe(1);
      expect(stale.nodes[0].id).toBe(n1.id);
      expect(stale.nodes[0].idle_duration).toContain('1 week'); // 10 days is ~1 week
    });
  });

  describe('validateGraph', () => {
    it('should validate logical issues in the graph', () => {
      const db = getDb(project);
      db.prepare('DELETE FROM edges').run();
      db.prepare('DELETE FROM nodes').run();

      // Create a done task that depends on a pending task
      const t1 = GraphEngine.addNode({
        project,
        type: 'task',
        title: 'Blocked Task',
        status: 'done',
      });
      const t2 = GraphEngine.addNode({
        project,
        type: 'task',
        title: 'Blocker Task',
        status: 'pending',
      });
      EdgeEngine.addEdge({ project, source_id: t1.id, target_id: t2.id, type: 'depends_on' });

      // Create an orphan node
      const orphan = GraphEngine.addNode({
        project,
        type: 'task',
        title: 'Orphan Task',
        status: 'pending',
      });

      // Create an empty milestone
      const milestone = GraphEngine.addNode({
        project,
        type: 'milestone',
        title: 'Empty Milestone',
        status: 'upcoming',
      });

      const res = validateGraph(db, { project });

      expect(res.passed).toBe(false); // blocked_done is an error

      const checks = res.issues.map((i) => i.check);
      expect(checks).toContain('blocked_done');
      expect(checks).toContain('orphan_nodes');
      expect(checks).toContain('empty_milestones');

      const orphanIssue = res.issues.find((i) => i.check === 'orphan_nodes');
      expect(orphanIssue?.node_ids).toContain(orphan.id);
    });

    it('should check for cycles', () => {
      const db = getDb(project);
      db.prepare('DELETE FROM edges').run();
      db.prepare('DELETE FROM nodes').run();

      const t1 = GraphEngine.addNode({ project, type: 'task', title: 'T1', status: 'pending' });
      const t2 = GraphEngine.addNode({ project, type: 'task', title: 'T2', status: 'pending' });

      // Circular depends_on: T1 depends on T2, and T2 depends on T1
      // Note: EdgeEngine.addEdge rejects cycles internally, so we force-inject in database directly to test validation!
      db.prepare(
        'INSERT INTO edges (id, project, source_id, target_id, type, properties, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run('e1', project, t1.id, t2.id, 'depends_on', '{}', new Date().toISOString());
      db.prepare(
        'INSERT INTO edges (id, project, source_id, target_id, type, properties, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run('e2', project, t2.id, t1.id, 'depends_on', '{}', new Date().toISOString());

      const res = validateGraph(db, { project, checks: ['cycle_check'] });
      expect(res.passed).toBe(false);
      expect(res.issues[0].check).toBe('cycle_check');
      expect(res.issues[0].node_ids).toContain(t1.id);
      expect(res.issues[0].node_ids).toContain(t2.id);
    });

    it('should check for unverified_ui issues', () => {
      const db = getDb(project);
      db.prepare('DELETE FROM edges').run();
      db.prepare('DELETE FROM nodes').run();

      // Create a done UI task
      const uiTask = GraphEngine.addNode({
        project,
        type: 'task',
        title: 'Align homepage logos',
        status: 'done',
        tags: ['ui'],
      });

      // Create a target artifact node (e.g. visual state)
      const visualState = GraphEngine.addNode({
        project,
        type: 'artifact',
        title: 'Visual State: Homepage mock',
        status: 'current',
      });

      // Run validation (should issue warning for unverified UI)
      let res = validateGraph(db, { project, checks: ['unverified_ui'] });
      expect(res.passed).toBe(true); // Warnings don't cause validation to fail
      let uiIssues = res.issues.filter((i) => i.check === 'unverified_ui');
      expect(uiIssues.length).toBe(1);
      expect(uiIssues[0].severity).toBe('warning');
      expect(uiIssues[0].node_ids).toContain(uiTask.id);

      // Connect to the visual state via renders_state edge
      EdgeEngine.addEdge({
        project,
        source_id: uiTask.id,
        target_id: visualState.id,
        type: 'renders_state',
      });

      // Run validation again (should resolve warning)
      res = validateGraph(db, { project, checks: ['unverified_ui'] });
      uiIssues = res.issues.filter((i) => i.check === 'unverified_ui');
      expect(uiIssues.length).toBe(0);

      // Remove edge and use visual metadata instead
      db.prepare('DELETE FROM edges').run();
      res = validateGraph(db, { project, checks: ['unverified_ui'] });
      uiIssues = res.issues.filter((i) => i.check === 'unverified_ui');
      expect(uiIssues.length).toBe(1);

      GraphEngine.updateNode({
        id: uiTask.id,
        project,
        metadata: { vision_state_id: visualState.id },
      });

      res = validateGraph(db, { project, checks: ['unverified_ui'] });
      uiIssues = res.issues.filter((i) => i.check === 'unverified_ui');
      expect(uiIssues.length).toBe(0);
    });
  });

  describe('pruneEvents', () => {
    it('should prune events correctly while keeping latest', () => {
      const db = getDb(project);
      db.prepare('DELETE FROM events').run();
      db.prepare('DELETE FROM nodes').run();

      const n1 = GraphEngine.addNode({
        project,
        type: 'task',
        title: 'Node for event pruning',
        status: 'pending',
      });

      // We have a creation event. Let's add 3 updates to generate events.
      GraphEngine.updateNode({ project, id: n1.id, status: 'in_progress' });
      GraphEngine.updateNode({ project, id: n1.id, tags: ['prune-1'] });
      GraphEngine.updateNode({ project, id: n1.id, tags: ['prune-2'] });

      // Now we have 4 events in the log.
      const totalEvents = EventEngine.getEventLog(db, { project, limit: 100 }).length;
      expect(totalEvents).toBe(4);

      // Backdate the first 3 events to 10 days ago
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare(
        'UPDATE events SET timestamp = ? WHERE entity_id = ? AND rowid < (SELECT MAX(rowid) FROM events WHERE entity_id = ?)'
      ).run(tenDaysAgo, n1.id, n1.id);

      // Prune events with dry_run = true
      const dryRes = EventEngine.pruneEvents(db, { project, older_than: '5d', dry_run: true });
      expect(dryRes.would_delete).toBe(3);
      expect(dryRes.deleted).toBe(0);

      // Actual prune
      const pruneRes = EventEngine.pruneEvents(db, { project, older_than: '5d', dry_run: false });
      expect(pruneRes.would_delete).toBe(0);
      expect(pruneRes.deleted).toBe(3);
      expect(pruneRes.preserved).toBe(1); // Latest event should be preserved!

      const remainingEvents = EventEngine.getEventLog(db, { project, limit: 100 });
      expect(remainingEvents.length).toBe(1);
    });
  });
});
