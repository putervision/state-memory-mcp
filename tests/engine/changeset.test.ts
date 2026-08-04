import { describe, it, expect, afterAll } from 'vitest';
import { getChanges } from '../../src/engine/changeset.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { EdgeEngine } from '../../src/engine/edges.js';
import { SessionEngine } from '../../src/engine/sessions.js';
import { getDb, closeAllDbs } from '../../src/engine/db.js';

describe('Changeset Engine (getChanges)', () => {
  const project = 'changeset-test-project';

  afterAll(() => {
    closeAllDbs();
  });

  it('should throw error when neither since nor since_session is provided', () => {
    const db = getDb(project);
    expect(() => getChanges(db, { project })).toThrow(
      'Either since or since_session parameter must be provided'
    );
  });

  it('should throw error when invalid since_session is provided', () => {
    const db = getDb(project);
    expect(() => getChanges(db, { project, since_session: 'invalid-session-id' })).toThrow(
      'Session not found: invalid-session-id'
    );
  });

  it('should compute changes since a session start', () => {
    const db = getDb(project);
    const session = SessionEngine.startSession(db, {
      project,
      agent_id: 'test-agent',
    });

    const task = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Created Task',
      session_id: session.session_id,
    });

    const dec = GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Accepted Decision',
      status: 'accepted',
      session_id: session.session_id,
    });

    const blocker = GraphEngine.addNode({
      project,
      type: 'blocker',
      title: 'Active Blocker',
      status: 'active',
      session_id: session.session_id,
    });

    const edge = EdgeEngine.addEdge({
      project,
      source_id: blocker.id,
      target_id: task.id,
      type: 'blocks',
    });

    const changes = getChanges(db, {
      project,
      since_session: session.session_id,
    });

    expect(changes.nodes_created.length).toBeGreaterThanOrEqual(3);
    expect(changes.decisions_made.length).toBeGreaterThanOrEqual(1);
    expect(changes.blockers_added.length).toBeGreaterThanOrEqual(1);
    expect(changes.edges_created.length).toBeGreaterThanOrEqual(1);
    expect(changes.summary).toContain('created');
  });

  it('should track updated nodes and deleted nodes in changeset', async () => {
    const db = getDb(project);

    const task = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Original Title',
    });

    const toDelete = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Temp Task',
    });

    // Wait a brief tick to ensure distinct ISO timestamp
    await new Promise((r) => setTimeout(r, 10));
    const since = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 10));

    GraphEngine.updateNode({
      project,
      id: task.id,
      title: 'Updated Title',
      status: 'in_progress',
    });

    GraphEngine.removeNode({
      project,
      id: toDelete.id,
    });

    const changes = getChanges(db, {
      project,
      since,
    });

    expect(changes.nodes_updated.length).toBeGreaterThanOrEqual(1);
    expect(changes.nodes_deleted.length).toBeGreaterThanOrEqual(1);
  });
});
