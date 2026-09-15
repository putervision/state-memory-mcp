import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphEngine } from '../../src/engine/graph.js';
import {
  postBlackboard,
  readBlackboard,
  setBlackboard,
  getBlackboard,
  deleteBlackboard,
  leaseBlackboard,
  listBlackboard,
} from '../../src/engine/blackboard.js';
import { graphHandlers } from '../../src/handlers/graph.js';
import { getDb, closeDb } from '../../src/engine/db.js';

describe('Multi-Agent Concurrency & Blackboard Infrastructure', () => {
  const project = 'blackboard-test-project';

  beforeEach(() => {
    closeDb(project);
    const db = getDb(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
    db.prepare('DELETE FROM blackboard WHERE project = ?').run(project);
  });

  afterEach(() => {
    closeDb(project);
  });

  it('should initialize nodes with version 1 and increment version on updates', () => {
    const node = GraphEngine.addNode({ project, type: 'task', title: 'Concurrency Task' });
    expect(node.version).toBe(1);

    const updated = GraphEngine.updateNode({ project, id: node.id, title: 'Concurrency Task V2' });
    expect(updated?.version).toBe(2);
  });

  it('should enforce expected_version optimistic concurrency checks', () => {
    const node = GraphEngine.addNode({ project, type: 'task', title: 'CAS Task' });
    expect(node.version).toBe(1);

    // Valid update matching expected version
    const updated1 = GraphEngine.updateNode({
      project,
      id: node.id,
      title: 'CAS Task V2',
      expected_version: 1,
    });
    expect(updated1?.version).toBe(2);

    // Mismatched expected version should throw error
    expect(() => {
      GraphEngine.updateNode({ project, id: node.id, title: 'Stale Update', expected_version: 1 });
    }).toThrow(/Concurrency conflict/);
  });

  it('should post and read agent messages on the blackboard store', () => {
    const msg1 = postBlackboard({
      project,
      agent_id: 'agent-coder-01',
      agent_role: 'coder',
      topic: 'auth_status',
      content: 'Refactoring JWT auth module',
    });
    expect(msg1.id).toBeDefined();

    const msg2 = postBlackboard({
      project,
      agent_id: 'agent-reviewer-01',
      agent_role: 'reviewer',
      topic: 'auth_status',
      content: 'Reviewing JWT auth security',
    });

    const messages = readBlackboard({ project, topic: 'auth_status' });
    expect(messages.length).toBe(2);
    expect(messages[0].agent_role).toBe('coder');
    expect(messages[1].agent_role).toBe('reviewer');
  });

  it('should filter expired blackboard messages based on ttl_seconds', async () => {
    postBlackboard({
      project,
      agent_id: 'agent-01',
      topic: 'ephemeral',
      content: 'Expiring message',
      ttl_seconds: 1, // 1 second TTL
    });

    let msgs = readBlackboard({ project, topic: 'ephemeral' });
    expect(msgs.length).toBe(1);

    // Wait 1.1s for expiration
    await new Promise((r) => setTimeout(r, 1100));

    msgs = readBlackboard({ project, topic: 'ephemeral' });
    expect(msgs.length).toBe(0);
  });

  it('should support canonical blackboard verbs: get, set, delete, lease, list', () => {
    // 1. set & get
    const item = setBlackboard({
      project,
      topic: 'pentad:status',
      content: 'Phase 1a active',
      agent_id: 'agent-01',
      agent_role: 'coordinator',
    });
    expect(item.id).toBeDefined();

    const fetchedById = getBlackboard({ project, id: item.id }) as any;
    expect(fetchedById).toBeDefined();
    expect(fetchedById.content).toBe('Phase 1a active');

    const fetchedByTopic = getBlackboard({ project, topic: 'pentad:status' }) as any[];
    expect(Array.isArray(fetchedByTopic)).toBe(true);
    expect(fetchedByTopic.length).toBe(1);

    // 2. list
    setBlackboard({
      project,
      topic: 'pentad:telemetry',
      content: 'cpu 10%',
      agent_id: 'agent-02',
    });
    const listRes = listBlackboard({ project });
    expect(listRes.topics).toContain('pentad:status');
    expect(listRes.topics).toContain('pentad:telemetry');
    expect(listRes.count).toBe(2);

    // 3. lease
    const lease1 = leaseBlackboard({
      project,
      resource_id: 'camera_front',
      agent_id: 'agent-01',
      duration_seconds: 30,
      mode: 'acquire',
    });
    expect(lease1.success).toBe(true);
    expect(lease1.expires_at).toBeDefined();

    // Conflicting lease by another agent should fail
    const leaseConflict = leaseBlackboard({
      project,
      resource_id: 'camera_front',
      agent_id: 'agent-02',
      duration_seconds: 30,
      mode: 'acquire',
    });
    expect(leaseConflict.success).toBe(false);
    expect(leaseConflict.message).toContain('currently leased by agent "agent-01"');

    // Release lease
    const releaseRes = leaseBlackboard({
      project,
      resource_id: 'camera_front',
      agent_id: 'agent-01',
      mode: 'release',
    });
    expect(releaseRes.success).toBe(true);

    // Now agent-02 can acquire
    const lease2 = leaseBlackboard({
      project,
      resource_id: 'camera_front',
      agent_id: 'agent-02',
      duration_seconds: 30,
      mode: 'acquire',
    });
    expect(lease2.success).toBe(true);

    // 4. delete
    const delRes = deleteBlackboard({ project, id: item.id });
    expect(delRes.success).toBe(true);
    expect(delRes.deleted_count).toBe(1);
    expect(getBlackboard({ project, id: item.id })).toBeNull();
  });

  it('should dispatch canonical and legacy actions via graphHandlers.use_blackboard', () => {
    // Canonical set
    const setRes = graphHandlers.use_blackboard({
      action: 'set',
      project,
      topic: 'dispatch:topic',
      content: 'dispatched payload',
      agent_id: 'agent-dispatch',
    }) as any;
    expect(setRes.id).toBeDefined();

    // Canonical get
    const getRes = graphHandlers.use_blackboard({
      action: 'get',
      project,
      topic: 'dispatch:topic',
    }) as any;
    expect(Array.isArray(getRes)).toBe(true);
    expect(getRes[0].content).toBe('dispatched payload');

    // Legacy post (with deprecation shim)
    const postRes = graphHandlers.use_blackboard({
      action: 'post',
      project,
      topic: 'dispatch:legacy',
      content: 'legacy payload',
    }) as any;
    expect(postRes.id).toBeDefined();

    // Legacy read
    const readRes = graphHandlers.use_blackboard({
      action: 'read',
      project,
      topic: 'dispatch:legacy',
    }) as any;
    expect(Array.isArray(readRes)).toBe(true);
    expect(readRes[0].content).toBe('legacy payload');

    // Canonical list
    const listRes = graphHandlers.use_blackboard({
      action: 'list',
      project,
    }) as any;
    expect(listRes.topics).toContain('dispatch:topic');
    expect(listRes.topics).toContain('dispatch:legacy');

    // Canonical lease
    const leaseRes = graphHandlers.use_blackboard({
      action: 'lease',
      project,
      resource_id: 'robot_arm',
      agent_id: 'agent-arm',
    }) as any;
    expect(leaseRes.success).toBe(true);

    // Canonical delete
    const delRes = graphHandlers.use_blackboard({
      action: 'delete',
      project,
      id: setRes.id,
    }) as any;
    expect(delRes.success).toBe(true);
  });
});
