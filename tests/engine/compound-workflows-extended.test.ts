import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  planAndDecomposeFeature,
  postMortemFromSession,
} from '../../src/engine/compound-workflows.js';
import { SessionEngine } from '../../src/engine/sessions.js';
import { GraphEngine } from '../../src/engine/graph.js';
import { getDb, closeDb } from '../../src/engine/db.js';

describe('Compound Workflow Tools Engine', () => {
  const project = 'compound-ext-test-project';

  beforeEach(() => {
    closeDb(project);
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
    db.prepare('DELETE FROM events WHERE project = ?').run(project);
    db.prepare('DELETE FROM sessions WHERE project = ?').run(project);
  });

  afterEach(() => {
    closeDb(project);
  });

  it('should plan and decompose a feature into plan, milestone, subtasks, and dependency edges', () => {
    const res = planAndDecomposeFeature({
      project,
      title: 'OAuth Authentication System',
      description: 'Implement full OAuth2 authorization code flow',
      milestone_title: 'Auth Milestone v1',
      subtasks: [
        { title: 'Setup Auth DB Tables', description: 'Create user and token tables' },
        {
          title: 'Implement Token Generator',
          description: 'JWT signing service',
          depends_on_index: 0,
        },
        {
          title: 'Build OAuth Callback Handler',
          description: 'Express handler',
          depends_on_index: 1,
        },
      ],
    });

    expect(res.plan).toBeDefined();
    expect(res.plan.type).toBe('plan');
    expect(res.milestone).toBeDefined();
    expect(res.milestone?.type).toBe('milestone');
    expect(res.tasks.length).toBe(3);

    // Verify dependency edge created between subtask 1 and subtask 0
    const depEdge = res.edges.find(
      (e) => e.type === 'depends_on' && e.source_id === res.tasks[1].id
    );
    expect(depEdge).toBeDefined();
    expect(depEdge?.target_id).toBe(res.tasks[0].id);
  });

  it('should analyze session event logs and generate post-mortem observation and report artifact', () => {
    const db = getDb(project);
    const session = SessionEngine.startSession(db, { project, agent_id: 'agent-01' });

    GraphEngine.addNode({ project, type: 'task', title: 'Task 1', session_id: session.session_id });
    GraphEngine.addNode({
      project,
      type: 'decision',
      title: 'Decision 1',
      session_id: session.session_id,
    });

    SessionEngine.endSession(db, { project, session_id: session.session_id });

    const pm = postMortemFromSession({
      project,
      session_id: session.session_id,
      summary_title: 'Session 01 Review',
    });

    expect(pm.observation).toBeDefined();
    expect(pm.observation.type).toBe('observation');
    expect(pm.artifact).toBeDefined();
    expect(pm.artifact.type).toBe('artifact');
    expect(pm.summary).toContain('Session Post-Mortem');
  });
});
