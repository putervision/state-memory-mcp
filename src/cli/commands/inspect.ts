import { getProjectSlug } from '../../engine/db.js';
import { QueryEngine } from '../../engine/queries.js';
import { logger } from '../../utils/logger.js';
import { Table, parsePositiveInt } from '../helper.js';

export async function inspectAction(options: { project?: string; limit?: string }) {
  const projectSlug = getProjectSlug(options.project);
  logger.info(`Inspecting project: ${projectSlug}`);

  try {
    const limitCount = parsePositiveInt(options.limit || '50', '--limit', 50);
    const list = await QueryEngine.listNodes({ project: projectSlug, git_branch: '*', limit: limitCount });
    
    console.log('\n======================================');
    console.log(` PROJECT STATE SUMMARY: ${projectSlug.toUpperCase()}`);
    console.log('======================================');
    console.log(`Total Nodes (showing up to ${limitCount}): ${list.total_count}`);
    
    const counts: Record<string, number> = {};
    const statusCounts: Record<string, Record<string, number>> = {};

    for (const n of list.nodes) {
      counts[n.type] = (counts[n.type] || 0) + 1;
      if (!statusCounts[n.type]) statusCounts[n.type] = {};
      statusCounts[n.type][n.status] = (statusCounts[n.type][n.status] || 0) + 1;
    }

    console.log('\nNode Type Distribution:');
    for (const [type, count] of Object.entries(counts)) {
      console.log(`  - ${type}: ${count}`);
      const statusMap = statusCounts[type];
      for (const [status, sCount] of Object.entries(statusMap)) {
        console.log(`      * ${status}: ${sCount}`);
      }
    }

    console.log('\nNodes List:');
    const table = new Table({
      head: ['Type', 'Title', 'Status', 'ID'],
      colWidths: [12, 45, 12, 30],
      wordWrap: true
    });
    for (const n of list.nodes) {
      table.push([
        n.type.toUpperCase(),
        n.title,
        n.status,
        n.id
      ]);
    }
    console.log(table.toString());
    console.log('======================================\n');
  } catch (error: any) {
    logger.error('Failed to inspect project:', error.message);
  }
}
