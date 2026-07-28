import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphEngine } from '../../src/engine/graph.js';
import { postBlackboard, readBlackboard } from '../../src/engine/blackboard.js';
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
});
