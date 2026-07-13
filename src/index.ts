import * as path from 'path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { server } from './server.js';
import { logger } from './utils/logger.js';
import { closeAllDbs, resolveProjectRoot, getProjectSlug } from './engine/db.js';
import { runAutoInit } from './cli/init.js';

let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  
  try {
    await server.close();
    logger.info('MCP server connection closed.');
  } catch (err: any) {
    logger.error('Error closing MCP server:', err.message);
  }
  
  try {
    closeAllDbs();
    logger.info('Database connections closed.');
  } catch (err: any) {
    logger.error('Error closing databases:', err.message);
  }
  
  if (signal === 'uncaughtException' || signal === 'unhandledRejection') {
    process.exit(1);
  } else {
    process.exitCode = 0;
  }
}

async function main() {
  // Automatically initialize/update project configurations and customizations on start
  try {
    const root = resolveProjectRoot();
    const projectName = path.basename(root);
    const projectSlug = getProjectSlug(projectName);
    
    // Perform fast, non-destructive file scaffolding check
    await runAutoInit(root, projectSlug);
  } catch (err: any) {
    logger.warn(`Auto-initialization skipped: ${err.message}`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('state-memory-mcp server started');
}

process.on('SIGINT', () => {
  shutdown('SIGINT').catch((err) => {
    logger.error('Error during shutdown:', err);
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch((err) => {
    logger.error('Error during shutdown:', err);
    process.exit(1);
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  shutdown('uncaughtException').catch((err) => {
    logger.error('Error during shutdown:', err);
    process.exit(1);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown('unhandledRejection').catch((err) => {
    logger.error('Error during shutdown:', err);
    process.exit(1);
  });
});

main().catch((error) => {
  logger.error('Fatal error in server:', error);
  process.exit(1);
});
