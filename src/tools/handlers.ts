import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z, ZodTypeAny } from 'zod';
import { toolDefinitions, READ_ONLY_TOOLS, DESTRUCTIVE_TOOLS } from './definitions.js';
import { toolHandlers } from '../handlers/index.js';
import { resolveProjectRoot } from '../engine/db.js';
import { loadProjectConfig } from '../engine/config.js';

function jsonSchemaToZod(prop: any): ZodTypeAny {
  if (!prop) return z.record(z.string(), z.any());

  if (prop.enum && Array.isArray(prop.enum) && prop.enum.length > 0) {
    return z.enum(prop.enum as [string, ...string[]]);
  }

  switch (prop.type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array': {
      if (prop.items) {
        return z.array(jsonSchemaToZod(prop.items));
      }
      return z.array(z.record(z.string(), z.any()));
    }
    case 'object': {
      if (prop.properties) {
        return jsonSchemaToZodObject(prop);
      }
      return z.record(z.string(), z.any());
    }
    default:
      return z.record(z.string(), z.any());
  }
}

export function jsonSchemaToZodObject(schema: Record<string, any>): z.ZodObject<any> {
  const shape: Record<string, ZodTypeAny> = {};
  const properties = schema?.properties || {};
  const requiredFields = new Set<string>(schema?.required || []);

  for (const [key, prop] of Object.entries<any>(properties)) {
    let fieldZod = jsonSchemaToZod(prop);

    if (prop.description) {
      fieldZod = fieldZod.describe(prop.description);
    }

    if (!requiredFields.has(key)) {
      fieldZod = fieldZod.optional();
    }

    shape[key] = fieldZod;
  }

  return z.object(shape);
}

export function registerAllTools(server: McpServer): void {
  for (const toolDef of toolDefinitions) {
    const name = toolDef.name;
    const title = name
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const isDestructive = DESTRUCTIVE_TOOLS.has(name);
    const isReadOnly = READ_ONLY_TOOLS.has(name);
    const inputZodSchema = jsonSchemaToZodObject(toolDef.inputSchema);

    server.registerTool(
      name,
      {
        title,
        description: toolDef.description,
        inputSchema: inputZodSchema as any,
        annotations: {
          readOnlyHint: isReadOnly,
          destructiveHint: isDestructive,
          openWorldHint: false,
        },
      },
      async (args: any) => {
        const handler = toolHandlers[name];
        if (!handler) {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }

        // Security & Access Control Enforcement
        const projectRoot = resolveProjectRoot(args?.project);
        const config = loadProjectConfig(projectRoot);
        const accessMode =
          process.env.STATE_MEMORY_READ_ONLY === 'true'
            ? 'read_only'
            : process.env.STATE_MEMORY_AUDIT_ONLY === 'true'
              ? 'audit_only'
              : config.accessMode || 'normal';

        if (accessMode === 'read_only' && !READ_ONLY_TOOLS.has(name)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Access denied: server is running in read-only mode and tool "${name}" modifies state.`
          );
        }

        if (
          accessMode === 'audit_only' &&
          ![
            'doctor_report',
            'validate_graph',
            'verify_audit_chain',
            'audit_project_db',
            'get_project_summary',
            'get_context_snapshot',
          ].includes(name)
        ) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Access denied: server is running in audit-only mode.`
          );
        }

        if (
          name === 'prune_events' &&
          process.env.STATE_MEMORY_ADMIN_MODE !== 'true' &&
          (config as any).accessMode !== 'admin'
        ) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Access denied: "prune_events" requires admin mode.`
          );
        }

        const result = await handler(args);
        const text =
          result === undefined
            ? ''
            : typeof result === 'string'
              ? result
              : JSON.stringify(result, null, 2);

        return {
          content: [
            {
              type: 'text' as const,
              text,
            },
          ],
        };
      }
    );
  }
}
