import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AnalyticsEngine } from '../engine/analytics.js';
import { getProjectSlug } from '../engine/db.js';

export function registerAllPrompts(server: McpServer): void {
  server.registerPrompt(
    'review-decisions',
    {
      title: 'Review Decisions',
      description: 'Review accepted design decisions and check for contradictions',
      argsSchema: {
        project: z.string().optional().describe('Optional project identifier'),
      },
    },
    async (args) => {
      const projectSlug = getProjectSlug(args.project);
      const summary = AnalyticsEngine.getProjectSummary({ project: projectSlug });
      const contradictions = AnalyticsEngine.detectContradictions({ project: projectSlug });

      let contradictionsText = 'No contradictions detected!';
      const totalAnomalies =
        contradictions.blocked_done_tasks.length + contradictions.contradicting_decisions.length;
      if (totalAnomalies > 0) {
        contradictionsText =
          `Detected ${totalAnomalies} logical anomalies:\n` +
          contradictions.blocked_done_tasks
            .map((t) => `- Task "${t.task.title}" is done but blocked by "${t.blocker.title}"`)
            .join('\n') +
          '\n' +
          contradictions.contradicting_decisions
            .map(
              (d) => `- Decision "${d.decision1.title}" contradicts decision "${d.decision2.title}"`
            )
            .join('\n');
      }

      return {
        description: 'Decision log and contradictions audit',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please review the decision log for project "${projectSlug}".\n\nAccepted Decisions:\n${JSON.stringify(summary.recent_decisions)}\n\nLogical Contradictions:\n${contradictionsText}\n\nSuggest any updates or corrections needed.`,
            },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    'triage-blockers',
    {
      title: 'Triage Blockers',
      description: 'Review and triage active blockers across the dependency graph',
      argsSchema: {
        project: z.string().optional().describe('Optional project identifier'),
      },
    },
    async (args) => {
      const projectSlug = getProjectSlug(args.project);
      const blockers = AnalyticsEngine.findBlockers({ project: projectSlug });
      const blockersText =
        blockers.length > 0
          ? blockers
              .map(
                (b) =>
                  `- Blocker: "${b.blocker_node.title}" (Status: ${b.blocker_node.status})\n  Blocks: ${b.blocked_nodes.map((n) => `"${n.node.title}" (depth ${n.depth})`).join(', ')}`
              )
              .join('\n')
          : 'No active blockers!';

      return {
        description: 'Triage active blockers',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I need to triage the active blockers for project "${projectSlug}".\n\nActive Blockers:\n${blockersText}\n\nHelp me analyze the critical path and suggest mitigation strategies to resolve these blockers.`,
            },
          },
        ],
      };
    }
  );
}
