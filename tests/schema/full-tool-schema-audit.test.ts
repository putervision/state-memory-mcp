import { describe, it, expect } from 'vitest';
import { toolDefinitions } from '../../src/tools/definitions.js';
import { jsonSchemaToZodObject } from '../../src/tools/handlers.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

describe('Comprehensive Tool Schema Audit (Draft-07 & VS Code MCP Compliance)', () => {
  it('should verify all 81 tools have valid inputSchema structures and no property defects', () => {
    expect(toolDefinitions.length).toBeGreaterThanOrEqual(80);

    const violations: string[] = [];
    const toolNameSet = new Set<string>();

    for (const toolDef of toolDefinitions) {
      const toolName = toolDef.name;

      // Check unique tool names
      if (toolNameSet.has(toolName)) {
        violations.push(`Duplicate tool name registered: "${toolName}"`);
      }
      toolNameSet.add(toolName);

      // Check tool description
      if (!toolDef.description || toolDef.description.trim().length === 0) {
        violations.push(`[${toolName}]: missing or empty description`);
      }

      const schema = toolDef.inputSchema;
      if (!schema || schema.type !== 'object') {
        violations.push(`[${toolName}]: inputSchema is missing or not type 'object'`);
        continue;
      }

      const properties = schema.properties || {};
      const required = schema.required || [];

      // Check required is an array
      if (schema.required !== undefined && !Array.isArray(schema.required)) {
        violations.push(`[${toolName}]: "required" is not an array`);
      }

      // Check required fields exist in properties
      for (const reqKey of required) {
        if (!properties[reqKey]) {
          violations.push(
            `[${toolName}]: required field "${reqKey}" is not declared in properties`
          );
        }
      }

      // Check each property recursively
      auditProperties(toolName, properties, violations);

      // Verify Zod conversion & JSON Schema generation
      try {
        const zodSchema = jsonSchemaToZodObject(schema);
        const generatedJsonSchema: any = zodToJsonSchema(zodSchema);

        verifyGeneratedJsonSchema(toolName, generatedJsonSchema, violations);
      } catch (err: any) {
        violations.push(`[${toolName}]: Zod / JSON Schema conversion threw error: ${err.message}`);
      }
    }

    if (violations.length > 0) {
      console.error('SCHEMA AUDIT VIOLATIONS DETECTED:\n' + violations.join('\n'));
      throw new Error(
        `Found ${violations.length} schema audit violation(s). See console log for details.`
      );
    }
  });
});

function auditProperties(
  parentPath: string,
  properties: Record<string, any>,
  violations: string[]
) {
  for (const [propName, propDef] of Object.entries(properties)) {
    const currentPath = `${parentPath}.${propName}`;

    if (!propDef || typeof propDef !== 'object') {
      violations.push(`[${currentPath}]: property definition is not an object`);
      continue;
    }

    // Check type presence
    if (!propDef.type && !propDef.enum) {
      violations.push(`[${currentPath}]: missing "type" or "enum" declaration`);
    }

    // Check array items
    if (propDef.type === 'array') {
      if (!propDef.items) {
        violations.push(`[${currentPath}]: type is "array" but missing "items" schema`);
      } else if (typeof propDef.items !== 'object' || Object.keys(propDef.items).length === 0) {
        violations.push(`[${currentPath}]: "items" is empty or invalid`);
      } else if (propDef.items.type === 'object' && propDef.items.properties) {
        auditProperties(`${currentPath}[items]`, propDef.items.properties, violations);
      }
    }

    // Check enum validity
    if (propDef.enum) {
      if (!Array.isArray(propDef.enum) || propDef.enum.length === 0) {
        violations.push(`[${currentPath}]: enum is declared but is empty or not an array`);
      } else {
        for (const item of propDef.enum) {
          if (typeof item !== 'string' || item.trim().length === 0) {
            violations.push(`[${currentPath}]: enum contains non-string or empty item: ${item}`);
          }
        }
      }
    }

    // Check description
    if (propDef.description && typeof propDef.description !== 'string') {
      violations.push(`[${currentPath}]: description is not a string`);
    }
  }
}

function verifyGeneratedJsonSchema(toolName: string, jsonSchema: any, violations: string[]) {
  if (!jsonSchema) return;

  function traverse(path: string, node: any) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'array') {
      if (!node.items || (typeof node.items === 'object' && Object.keys(node.items).length === 0)) {
        violations.push(`[${path}]: Generated JSON Schema has type 'array' without valid 'items'`);
      }
    }

    if (node.properties) {
      for (const [k, v] of Object.entries(node.properties)) {
        traverse(`${path}.${k}`, v);
      }
    }

    if (node.items) {
      traverse(`${path}[items]`, node.items);
    }
  }

  traverse(toolName, jsonSchema);
}
