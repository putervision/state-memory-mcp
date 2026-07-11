import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ParseResult } from '../schema/schemas.js';
import { getDb } from '../engine/db.js';

export function parseArgs<T>(schema: { safeParse: (args: any) => ParseResult<T> }, args: any): T {
  const parsed = schema.safeParse(args);
  if (!parsed.success || !parsed.data) {
    const errorMsg =
      parsed.error?.errors.map((e) => e.message).join(', ') || 'Unknown validation error';
    throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${errorMsg}`);
  }
  return parsed.data;
}

export function suggestLinks(projectSlug: string, node: any): void {
  try {
    const db = getDb(projectSlug);
    const suggestions: string[] = [];
    if (node.type === 'decision') {
      const recentTasks = db
        .prepare(
          `
        SELECT id, title FROM nodes 
        WHERE project = ? AND type = 'task' AND status != 'done' AND status != 'cancelled'
        ORDER BY updated_at DESC LIMIT 3
      `
        )
        .all(projectSlug) as any[];
      if (recentTasks.length > 0) {
        suggestions.push(
          `Consider linking decision "${node.title}" (${node.id}) to pending tasks using add_edge (type: 'decided_in' or 'blocks'):`
        );
        for (const t of recentTasks) {
          suggestions.push(`- Task: "${t.title}" (ID: ${t.id})`);
        }
      }
    } else if (node.type === 'task') {
      const recentDecisions = db
        .prepare(
          `
        SELECT id, title FROM nodes 
        WHERE project = ? AND type = 'decision' AND status = 'accepted'
        ORDER BY updated_at DESC LIMIT 3
      `
        )
        .all(projectSlug) as any[];
      if (recentDecisions.length > 0) {
        suggestions.push(
          `Did task "${node.title}" (${node.id}) originate from a decision? Consider linking them via decided_in:`
        );
        for (const d of recentDecisions) {
          suggestions.push(`- Decision: "${d.title}" (ID: ${d.id})`);
        }
      }
    }
    if (suggestions.length > 0) {
      node._suggestions = suggestions;
    }
  } catch {
    // Ignore suggestion errors
  }
}
