import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  toolDefinitions,
  READ_ONLY_TOOLS,
  READ_ONLY_ACTIONS,
  DESTRUCTIVE_TOOLS,
  DESTRUCTIVE_ACTIONS,
} from './definitions.js';
import { toolHandlers } from '../handlers/index.js';
import { resolveProjectRoot } from '../engine/db.js';
import { loadProjectConfig } from '../engine/config.js';
import { LEGACY_TOOL_MAP, translateLegacyCall } from './compat-shim.js';
import { resolveAction, generateToolActionGuidance } from '../engine/advisor.js';

export function jsonSchemaToZod(schema: any): z.ZodTypeAny {
  if (!schema || typeof schema !== 'object') {
    return z.any();
  }

  if (schema.type === 'string') {
    if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
      return z.enum(schema.enum as [string, ...string[]]);
    }
    return z.string();
  }

  if (schema.type === 'number') {
    return z.number();
  }

  if (schema.type === 'boolean') {
    return z.boolean();
  }

  if (schema.type === 'array') {
    const itemSchema = schema.items ? jsonSchemaToZod(schema.items) : z.any();
    return z.array(itemSchema);
  }

  if (schema.type === 'object') {
    if (!schema.properties) {
      return z.record(z.any());
    }
    const shape: Record<string, z.ZodTypeAny> = {};
    const properties = schema.properties || {};
    const required = new Set(schema.required || []);

    for (const [key, propSchema] of Object.entries(properties)) {
      let zodProp: z.ZodTypeAny;
      if (key === 'action') {
        zodProp = z.string().optional();
      } else {
        zodProp = jsonSchemaToZod(propSchema);
      }
      if ((propSchema as any).description) {
        zodProp = zodProp.describe((propSchema as any).description);
      }
      if (!required.has(key) || key === 'action') {
        zodProp = zodProp.optional();
      }
      shape[key] = zodProp;
    }

    return z.object(shape).passthrough();
  }

  return z.any();
}

export function jsonSchemaToZodObject(schema: any): z.ZodObject<any> {
  const zod = jsonSchemaToZod(schema);
  if (zod instanceof z.ZodObject) {
    return zod;
  }
  return z.object({}).passthrough();
}

export function registerAllTools(server: McpServer): void {
  // 1. Register the 13 consolidated tools
  for (const toolDef of toolDefinitions) {
    const name = toolDef.name;
    const title = name
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const isReadOnlyTool = READ_ONLY_TOOLS.has(name);
    const inputZodSchema = jsonSchemaToZodObject(toolDef.inputSchema);

    server.registerTool(
      name,
      {
        title,
        description: toolDef.description,
        inputSchema: inputZodSchema as any,
        annotations: {
          readOnlyHint: isReadOnlyTool,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async (args: any) => {
        const handler = toolHandlers[name];
        if (!handler) {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }

        const rawAction = args?.action;
        const resolution = resolveAction(name, rawAction, args || {});

        if (!resolution.action) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(resolution.errorGuidance, null, 2),
              },
            ],
          };
        }

        const action = resolution.action;
        const effectiveArgs = { ...(args || {}), action };
        const actionKey = `${name}:${action}`;

        // Security & Access Control Enforcement
        const projectRoot = resolveProjectRoot(effectiveArgs?.project);
        const config = loadProjectConfig(projectRoot);
        const accessMode =
          process.env.STATE_MEMORY_READ_ONLY === 'true'
            ? 'read_only'
            : process.env.STATE_MEMORY_AUDIT_ONLY === 'true'
              ? 'audit_only'
              : config.accessMode || 'normal';

        const isReadOnlyAction = isReadOnlyTool || READ_ONLY_ACTIONS.has(actionKey);

        if (accessMode === 'read_only' && !isReadOnlyAction) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Access denied: server is running in read-only mode and action "${actionKey}" modifies state.`
          );
        }

        if (
          accessMode === 'audit_only' &&
          ![
            'run_diagnostics:doctor',
            'run_diagnostics:validate',
            'run_diagnostics:audit_chain',
            'manage_database:audit',
            'get_analytics:summary',
            'get_analytics:context_snapshot',
          ].includes(actionKey)
        ) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Access denied: server is running in audit-only mode.`
          );
        }

        if (
          ((name === 'run_diagnostics' && action === 'prune_events') ||
            (name === 'run_maintenance' && action === 'prune_events') ||
            name === 'prune_events') &&
          process.env.STATE_MEMORY_ADMIN_MODE !== 'true'
        ) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Access denied: "prune_events" requires STATE_MEMORY_ADMIN_MODE=true.`
          );
        }

        const result = await handler(effectiveArgs);
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

  // 2. Register legacy tool shims if STATE_MEMORY_COMPAT=true
  if (process.env.STATE_MEMORY_COMPAT === 'true') {
    for (const [legacyName, mapping] of Object.entries(LEGACY_TOOL_MAP)) {
      const isReadOnly =
        READ_ONLY_TOOLS.has(legacyName) ||
        READ_ONLY_ACTIONS.has(`${mapping.tool}:${mapping.action}`);
      const isDestructive =
        DESTRUCTIVE_TOOLS.has(legacyName) ||
        DESTRUCTIVE_ACTIONS.has(`${mapping.tool}:${mapping.action}`);

      server.registerTool(
        legacyName,
        {
          title: `[Deprecated] ${legacyName}`,
          description: `[DEPRECATED in v1.0] Legacy alias for ${mapping.tool}(action: "${mapping.action}"). Please migrate to ${mapping.tool}.`,
          inputSchema: z.record(z.any()) as any,
          annotations: {
            readOnlyHint: isReadOnly,
            destructiveHint: isDestructive,
            openWorldHint: false,
          },
        },
        async (args: any) => {
          const { tool, transformedArgs } = translateLegacyCall(legacyName, args);
          const targetHandler = toolHandlers[tool];
          if (!targetHandler) {
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Handler not found for consolidated tool: ${tool}`
            );
          }

          // Admin check on legacy prune_events
          if (legacyName === 'prune_events' && process.env.STATE_MEMORY_ADMIN_MODE !== 'true') {
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Access denied: "prune_events" requires STATE_MEMORY_ADMIN_MODE=true.`
            );
          }

          const result = await targetHandler(transformedArgs);
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
}
