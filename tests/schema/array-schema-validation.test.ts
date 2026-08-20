import { describe, it, expect } from 'vitest';
import { jsonSchemaToZodObject } from '../../src/tools/handlers.js';
import { toolDefinitions } from '../../src/tools/definitions.js';

describe('Tool Schema Validation (VS Code MCP Compatibility)', () => {
  it('should generate valid Zod schemas for all 13 tool definitions with items property for array fields', () => {
    expect(toolDefinitions.length).toBe(13);
    for (const toolDef of toolDefinitions) {
      const zodSchema = jsonSchemaToZodObject(toolDef.inputSchema);
      expect(zodSchema).toBeDefined();
    }
  });

  it('should construct items for manage_specs and manage_nodes array schemas', () => {
    const specTool = toolDefinitions.find((t) => t.name === 'manage_specs');
    expect(specTool).toBeDefined();

    const zodSchema = jsonSchemaToZodObject(specTool!.inputSchema);
    const parsed = zodSchema.safeParse({
      action: 'decompose_feature',
      title: 'New Feature',
      subtasks: ['Subtask 1', 'Subtask 2'],
    });

    expect(parsed.success).toBe(true);

    const nodesTool = toolDefinitions.find((t) => t.name === 'manage_nodes');
    expect(nodesTool).toBeDefined();
    const nodesZodSchema = jsonSchemaToZodObject(nodesTool!.inputSchema);
    const parsedBatch = nodesZodSchema.safeParse({
      action: 'batch_update',
      ids: ['id1', 'id2'],
      tags: ['tag1'],
    });
    expect(parsedBatch.success).toBe(true);
  });
});
