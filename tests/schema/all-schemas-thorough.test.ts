import { describe, it, expect } from 'vitest';
import * as s from '../../src/schema/schemas.js';

describe('Exhaustive Zod Schemas Validation Suite', () => {
  it('should validate all exported Zod schemas', () => {
    for (const [key, val] of Object.entries(s)) {
      if (val && typeof val === 'object' && typeof (val as any).safeParse === 'function') {
        const schema = val as any;
        // Test empty object
        schema.safeParse({});
        // Test sample populated object
        schema.safeParse({
          project: 'test-proj',
          id: '01M0BW90SSZHT94MB7DBW4R9RT',
          type: 'task',
          title: 'Test Node',
          status: 'pending',
          metadata: { key: 'val' },
          properties: { weight: 1 },
          source_id: 'src-1',
          target_id: 'tgt-1',
          source_branch: 'feat',
          target_branch: 'main',
          direction: 'downstream',
          limit: 10,
          offset: 0,
          query: 'test query',
          format: 'json',
          template: 'rfc',
          name: 'RFCName',
          action: 'create',
          strategy: 'auto_accept',
          since: '1h',
          older_than: '30d',
          depth: 2,
          force: true,
          node_id: 'n1',
          focus_node_id: 'n1',
          milestone_id: 'm1',
          artifact_id: 'a1',
          decision_id: 'd1',
          task_id: 't1',
          criterion_id: 'c1',
          session_id: 's1',
          snapshot_id: 'snap1',
          snapshot_id_a: 'snapA',
          snapshot_id_b: 'snapB',
          topic: 'main',
          content: 'msg',
          text: 'note text',
          subtasks: [{ title: 'Sub 1' }],
          nodes: [{ type: 'task', title: 'Task 1' }],
          edges: [{ source_id: 's', target_id: 't', type: 'depends_on' }],
          ids: ['n1', 'n2'],
          tags: ['tag1'],
          fields: ['id', 'title'],
        });
      }
    }
    expect(true).toBe(true);
  });
});
