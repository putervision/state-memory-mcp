import { execSync } from 'child_process';
import { logger } from './logger.js';

export function getCurrentBranch(cwd: string = process.cwd()): string {
  if (process.env.STATE_GRAPH_MCP_DEFAULT_BRANCH) {
    return process.env.STATE_GRAPH_MCP_DEFAULT_BRANCH;
  }
  try {
    const branch = execSync('git branch --show-current', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
    }).trim();
    if (branch) {
      return branch;
    }
  } catch (err) {
    // Gracefully handle if not a git repository or git command fails
    logger.debug('Failed to auto-detect git branch, falling back to "main".', err);
  }
  return 'main';
}
