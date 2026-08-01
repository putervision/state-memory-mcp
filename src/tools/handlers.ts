import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z, ZodTypeAny } from 'zod';
import { toolDefinitions, READ_ONLY_TOOLS, DESTRUCTIVE_TOOLS } from './definitions.js';
import { toolHandlers } from '../handlers/index.js';
import { resolveProjectRoot } from '../engine/db.js';
import { loadProjectConfig } from '../engine/config.js';

function jsonSchemaToZodObject(schema: Record<string, any>): z.ZodObject<any> {
  const shape: Record<string, ZodTypeAny> = {};
  const properties = schema?.properties || {};
  const requiredFields = new Set<string>(schema?.required || []);

  for (const [key, prop] of Object.entries<any>(properties)) {
    let fieldZod: ZodTypeAny;

    if (prop.enum && Array.isArray(prop.enum) && prop.enum.length > 0) {
      fieldZod = z.enum(prop.enum as [string, ...string[]]);
    } else if (prop.type === 'string') {
      fieldZod = z.string();
    } else if (prop.type === 'number') {
      fieldZod = z.number();
    } else if (prop.type === 'boolean') {
      fieldZod = z.boolean();
    } else if (prop.type === 'array') {
      if (prop.items?.type === 'string') {
        fieldZod = z.array(z.string());
      } else {
        fieldZod = z.array(z.any());
      }
    } else if (prop.type === 'object') {
      fieldZod = z.record(z.string(), z.any());
    } else {
      fieldZod = z.any();
    }

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
