import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { server } from './server.js';
import { logger } from './utils/logger.js';
import { closeAllDbs } from './engine/db.js';

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('state-graph-mcp server started');
}

process.on('SIGINT', () => {
  logger.info('Shutting down...');
  closeAllDbs();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  closeAllDbs();
  process.exit(0);
});

main().catch((error) => {
  logger.error('Fatal error in server:', error);
  process.exit(1);
});
