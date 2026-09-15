import { VERSION } from './utils/version.js';
import { registerAllTools } from './tools/handlers.js';
import { registerAllPrompts } from './tools/prompts.js';
import { AnalyticsEngine } from './engine/analytics.js';
import { getNextTasks } from './engine/work-queue.js';
import { exportGraph } from './engine/export.js';
import { GraphEngine } from './engine/graph.js';
import { QueryEngine } from './engine/queries.js';
import { EventEngine } from './engine/events.js';
import { SessionEngine } from './engine/sessions.js';
import { getDb, getProjectSlug } from './engine/db.js';
import { toolDefinitions } from './tools/definitions.js';
import { NativeMcpServer, NativeResourceTemplate } from './transport/native-mcp.js';

export function registerAllResources(server: NativeMcpServer | any): void {
// Register Resource Templates
server.registerResource(
  'project-summary',
  new NativeResourceTemplate('state-memory:///{project}/summary', { list: undefined }),
  {
    title: 'Project Summary Template',
    description: 'High-level project state overview',
    mimeType: 'application/json',
  },
  async (uri: URL, variables: any) => {
    const projectSlug = getProjectSlug(variables.project);
    const data = AnalyticsEngine.getProjectSummary({ project: projectSlug });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(data),
        },
      ],
    };
  }
);

server.registerResource(
  'project-blockers',
  new NativeResourceTemplate('state-memory:///{project}/blockers', { list: undefined }),
  {
    title: 'Project Active Blockers Template',
    description: 'Currently active blocker nodes',
    mimeType: 'application/json',
  },
  async (uri: URL, variables: any) => {
    const projectSlug = getProjectSlug(variables.project);
    const data = AnalyticsEngine.findBlockers({ project: projectSlug });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(data),
        },
      ],
    };
  }
);

server.registerResource(
  'project-next-tasks',
  new NativeResourceTemplate('state-memory:///{project}/tasks/next', { list: undefined }),
  {
    title: 'Project Next Tasks Template',
    description: 'Next unblocked runnable tasks',
    mimeType: 'application/json',
  },
  async (uri: URL, variables: any) => {
    const projectSlug = getProjectSlug(variables.project);
    const db = getDb(projectSlug);
    const data = getNextTasks(db, { project: projectSlug, limit: 10 });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(data),
        },
      ],
    };
  }
);

server.registerResource(
  'project-node-details',
  new NativeResourceTemplate('state-memory:///{project}/node/{id}', { list: undefined }),
  {
    title: 'Project Node Details Template',
    description: 'Individual node details and connected edges',
    mimeType: 'application/json',
  },
  async (uri: URL, variables: any) => {
    const projectSlug = getProjectSlug(variables.project);
    const data = GraphEngine.getNode({ project: projectSlug, id: variables.id });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(data),
        },
      ],
    };
  }
);

server.registerResource(
  'project-metrics',
  new NativeResourceTemplate('state-memory:///{project}/metrics', { list: undefined }),
  {
    title: 'Project Metrics Template',
    description: 'Value metrics and project velocity',
    mimeType: 'application/json',
  },
  async (uri: URL, variables: any) => {
    const projectSlug = getProjectSlug(variables.project);
    const data = AnalyticsEngine.valueMetrics({ project: projectSlug });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(data),
        },
      ],
    };
  }
);

server.registerResource(
  'project-decisions',
  new NativeResourceTemplate('state-memory:///{project}/decisions', { list: undefined }),
  {
    title: 'Project Decision Log Template',
    description: 'Recent accepted decisions',
    mimeType: 'application/json',
  },
  async (uri: URL, variables: any) => {
    const projectSlug = getProjectSlug(variables.project);
    const data = await QueryEngine.listNodes({ project: projectSlug, type: 'decision', status: 'accepted' });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(data.nodes),
        },
      ],
    };
  }
);

server.registerResource(
  'project-graph-json',
  new NativeResourceTemplate('state-memory:///{project}/graph.json', { list: undefined }),
  {
    title: 'Project Graph Export Template',
    description: 'Full node/edge graph export',
    mimeType: 'application/json',
  },
  async (uri: URL, variables: any) => {
    const projectSlug = getProjectSlug(variables.project);
    const data = exportGraph({ project: projectSlug, format: 'json' });
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text,
        },
      ],
    };
  }
);

server.registerResource(
  'project-events',
  new NativeResourceTemplate('state-memory:///{project}/events', { list: undefined }),
  {
    title: 'Project Events Template',
    description: 'Recent state-transition events',
    mimeType: 'application/json',
  },
  async (uri: URL, variables: any) => {
    const projectSlug = getProjectSlug(variables.project);
    const db = getDb(projectSlug);
    const data = EventEngine.getEventLog(db, { project: projectSlug, limit: 50 });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(data),
        },
      ],
    };
  }
);

server.registerResource(
  'project-sessions',
  new NativeResourceTemplate('state-memory:///{project}/sessions', { list: undefined }),
  {
    title: 'Project Sessions Template',
    description: 'Recent session history',
    mimeType: 'application/json',
  },
  async (uri: URL, variables: any) => {
    const projectSlug = getProjectSlug(variables.project);
    const db = getDb(projectSlug);
    const data = SessionEngine.listSessions(db, { project: projectSlug, limit: 20 });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(data),
        },
      ],
    };
  }
);

server.registerResource(
  'state-health',
  'state:///health',
  {
    title: 'State Memory Server Health',
    description: 'Server health status, version, and timestamp',
    mimeType: 'application/json',
  },
  async (uri: URL) => {
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({
            status: 'healthy',
            version: VERSION,
            timestamp: new Date().toISOString(),
          }, null, 2),
        },
      ],
    };
  }
);

  // Register pv://docs/... documentation resources (E13)
  for (const tool of toolDefinitions) {
    server.registerResource(
      `docs-${tool.name}`,
      `pv://docs/${tool.name}`,
      {
        title: `${tool.name} Documentation`,
        description: `Complete parameter schema and documentation for ${tool.name}`,
        mimeType: 'application/json',
      },
      async (uri: URL) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                tool: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
              },
              null,
              2
            ),
          },
        ],
      })
    );
  }

  server.registerResource(
    'tool-docs-template',
    new NativeResourceTemplate('pv://docs/{toolName}', { list: undefined }),
    {
      title: 'Tool Documentation Template',
      description: 'Fetch detailed tool documentation and parameter schema via pv://docs/{toolName}',
      mimeType: 'application/json',
    },
    async (uri: URL, variables: any) => {
      const toolName = Array.isArray(variables.toolName) ? variables.toolName[0] : variables.toolName;
      const tool = toolDefinitions.find((t) => t.name === toolName);
      if (!tool) {
        throw new Error(`Documentation not found for tool: "${toolName}"`);
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                tool: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}

// Zero-Dependency Native McpServer Factory
export function createNativeServer(): NativeMcpServer {
  const native = new NativeMcpServer({
    name: 'io.github.putervision/state-memory-mcp',
    version: VERSION,
  });

  registerAllResources(native);
  registerAllTools(native);
  registerAllPrompts(native);

  return native;
}

// Default Native Server Instance
export const server = createNativeServer();


