import { describe, it, expect } from 'vitest';
import { jsonSchemaToZodObject } from '../../src/tools/handlers.js';
import { toolDefinitions } from '../../src/tools/definitions.js';

describe('Tool Schema Validation (VS Code MCP Compatibility)', () => {
  it('should generate valid Zod schemas for all tool definitions with items property for array fields', () => {
    for (const toolDef of toolDefinitions) {
      const zodSchema = jsonSchemaToZodObject(toolDef.inputSchema);
      expect(zodSchema).toBeDefined();
    }
  });

  it('should construct items for plan_and_decompose_feature subtasks array schema', () => {
    const planTool = toolDefinitions.find((t) => t.name === 'plan_and_decompose_feature');
    expect(planTool).toBeDefined();

    const zodSchema = jsonSchemaToZodObject(planTool!.inputSchema);
    const parsed = zodSchema.safeParse({
      title: 'New Feature',
      subtasks: [
        {
          title: 'Subtask 1',
          description: 'Desc 1',
          depends_on_index: 0,
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});
