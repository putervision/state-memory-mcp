import { describe, it, expect } from 'vitest';
import { nodeHandlers } from '../src/handlers/node.js';

describe('Unindented JSON Response Format Tests', () => {
  it('should verify node object serializes to compact unindented JSON string', () => {
    const node = { id: '01ABC', type: 'task', title: 'Sample Task', status: 'pending' };
    const unindented = JSON.stringify(node);
    const indented = JSON.stringify(node, null, 2);

    expect(unindented).not.toContain('\n');
    expect(indented).toContain('\n');
    expect(unindented.length).toBeLessThan(indented.length);
  });
});
