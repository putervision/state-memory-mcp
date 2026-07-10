import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { SessionEngine } from '../../src/engine/sessions.js';
import { EventEngine } from '../../src/engine/events.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { closeAllDbs, getDb } from '../../src/engine/db.js';

describe('SessionEngine Integration Tests', () => {
  const project = 'session-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM sessions').run();
    db.prepare('DELETE FROM events').run();
    db.prepare('DELETE FROM nodes').run();
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should start and list sessions', () => {
    const db = getDb(project);
    const sessionRes = SessionEngine.startSession(db, {
      project,
      agent_id: 'agent-123',
      metadata: { purpose: 'testing' },
    });

    expect(sessionRes.session_id).toBeDefined();

    const list = SessionEngine.listSessions(db, { project });
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(sessionRes.session_id);
    expect(list[0].agent_id).toBe('agent-123');
    expect(list[0].ended_at).toBeNull();
    expect(JSON.parse(list[0].metadata).purpose).toBe('testing');
  });

  it('should end sessions and filter by active_only', () => {
    const db = getDb(project);
    const s1 = SessionEngine.startSession(db, { project, agent_id: 'active-agent' });
    const s2 = SessionEngine.startSession(db, { project, agent_id: 'ended-agent' });

    SessionEngine.endSession(db, {
      project,
      session_id: s2.session_id,
    });

    const activeList = SessionEngine.listSessions(db, { project, active_only: true });
    expect(activeList.length).toBe(1);
    expect(activeList[0].id).toBe(s1.session_id);

    const allList = SessionEngine.listSessions(db, { project });
    expect(allList.length).toBe(2);
  });

  it('should propagate session_id to events when operations are performed', () => {
    const db = getDb(project);
    const session = SessionEngine.startSession(db, { project, agent_id: 'runner' });

    GraphEngine.addNode({
      project,
      type: 'task',
      title: 'Tracked Task',
      session_id: session.session_id,
    });

    const events = EventEngine.getEventLog(db, { project });
    expect(events.length).toBe(1);
    expect(events[0].session_id).toBe(session.session_id);
  });
});
