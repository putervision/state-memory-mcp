import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { GraphEngine } from '../../src/engine/graph.js';
import { getDb, closeAllDbs } from '../../src/engine/db.js';
import { synergyHandlers } from '../../src/handlers/synergy.js';
import { EventEngine } from '../../src/engine/events.js';

describe('Additional High-Coverage Edge Cases', () => {
  const project = 'more-cov-test-project';

  beforeEach(() => {
    const db = getDb(project);
    db.prepare('DELETE FROM edges WHERE project = ?').run(project);
    db.prepare('DELETE FROM nodes WHERE project = ?').run(project);
    db.prepare('DELETE FROM events WHERE project = ?').run(project);
  });

  afterAll(() => {
    closeAllDbs();
  });

  it('should test dual-memory synergy handlers link_visual_state and metrics', async () => {
    const nodeA = GraphEngine.addNode({
      project,
      type: 'task',
      title: 'UI Component',
    });

    const linkRes = synergyHandlers.link_visual_state({
      project,
      target_id: nodeA.id,
      visual_state_id: 'vs-456',
      relationship: 'verifies_visual_state',
      metadata: { layoutScore: 0.98 },
    });
    expect(linkRes.edge_id).toBeDefined();

    const metricsRes = await synergyHandlers.get_synergy_metrics({ project });
    expect(metricsRes.synergy_health).toBeDefined();
  });

  it('should test EventEngine verification failure on tampered hash chain', () => {
    const db = getDb(project);
    EventEngine.logEvent(db, {
      project,
      event_type: 'node_created',
      entity_type: 'node',
      entity_id: 'node-1',
    });

    const validVerification = EventEngine.verifyAuditChain(db, project);
    expect(validVerification.valid).toBe(true);

    // Tamper with hash record in database
    db.prepare("UPDATE events SET hash = 'tampered-hash-value' WHERE project = ?").run(project);

    const invalidVerification = EventEngine.verifyAuditChain(db, project);
    expect(invalidVerification.valid).toBe(false);
  });
});
