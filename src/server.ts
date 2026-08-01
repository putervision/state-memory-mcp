import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
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

export const server = new McpServer({
  name: 'io.github.putervision/state-memory-mcp',
  version: VERSION,
});

// Register Resource Templates
server.registerResource(
  'project-summary',
  new ResourceTemplate('state-memory:///{project}/summary', { list: undefined }),
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
  new ResourceTemplate('state-memory:///{project}/blockers', { list: undefined }),
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
  new ResourceTemplate('state-memory:///{project}/tasks/next', { list: undefined }),
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
  new ResourceTemplate('state-memory:///{project}/node/{id}', { list: undefined }),
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
  new ResourceTemplate('state-memory:///{project}/metrics', { list: undefined }),
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
  new ResourceTemplate('state-memory:///{project}/decisions', { list: undefined }),
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
  new ResourceTemplate('state-memory:///{project}/graph.json', { list: undefined }),
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
  new ResourceTemplate('state-memory:///{project}/events', { list: undefined }),
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
  new ResourceTemplate('state-memory:///{project}/sessions', { list: undefined }),
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

// Register Tools & Prompts
registerAllTools(server);
registerAllPrompts(server);
