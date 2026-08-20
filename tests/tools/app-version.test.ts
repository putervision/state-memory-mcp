import { describe, it, expect } from 'vitest';
import { analyticsHandlers } from '../../src/handlers/analytics.js';
import { toolDefinitions, READ_ONLY_TOOLS } from '../../src/tools/definitions.js';
import { VERSION } from '../../src/utils/version.js';

describe('run_diagnostics version action', () => {
  it('should be registered in toolDefinitions and READ_ONLY_ACTIONS', () => {
    const def = toolDefinitions.find((t) => t.name === 'run_diagnostics');
    expect(def).toBeDefined();
    expect(def?.description).toContain('version');
  });

  it('should return app version metadata when invoked', () => {
    const result: any = analyticsHandlers.run_diagnostics({ action: 'version' });
    expect(result).toBeDefined();
    expect(result.name).toBe('@putervision/state-memory-mcp');
    expect(result.mcp_name).toBe('io.github.putervision/state-memory-mcp');
    expect(result.version).toBe(VERSION);
    expect(result.description).toContain('Deterministic, persistent graph server');
    expect(result.environment).toBeDefined();
    expect(result.environment.node_version).toBe(process.version);
  });
});
