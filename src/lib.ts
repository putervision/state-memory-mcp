/**
 * state-memory-mcp Library Barrel Exports
 * Exposes core graph engines, mappers, schemas, types, and utility functions
 * for programmatic usage without running an MCP server or CLI.
 */

// Engines
export { GraphEngine } from './engine/graph.js';
export { EdgeEngine } from './engine/edges.js';
export { SessionEngine } from './engine/sessions.js';
export { EventEngine } from './engine/events.js';
export { SnapshotEngine } from './engine/snapshots.js';
export { TrajectoryEngine } from './engine/trajectories.js';
export { AnalyticsEngine } from './engine/analytics.js';
export { auditProjectDb, findCycles } from './engine/audit.js';

// Database & Scaffolding
export { getDb, getReadOnlyDb, closeDb, closeAllDbs, getProjectSlug, registerProject } from './engine/db.js';
export { runStaticScaffolder, scaffoldTemplate } from './engine/scaffolder.js';

// Schema & Types
export * from './schema/types.js';
export * from './schema/schemas.js';

// Row Mappers
export { parseNodeRow, parseEdgeRow } from './engine/row-mappers.js';

// Utilities
export { VERSION } from './utils/version.js';
export { logger } from './utils/logger.js';
export { validatePath } from './utils/path-validator.js';
