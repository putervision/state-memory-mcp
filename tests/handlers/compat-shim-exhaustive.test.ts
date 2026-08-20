import { describe, it, expect } from 'vitest';
import {
  translateLegacyCall,
  LEGACY_TOOL_MAP,
  REMOVED_TOOLS,
} from '../../src/tools/compat-shim.js';

describe('Compat Shim Exhaustive Test Suite', () => {
  it('should correctly translate all known legacy tools in LEGACY_TOOL_MAP', () => {
    for (const [legacyName, mapping] of Object.entries(LEGACY_TOOL_MAP)) {
      const result = translateLegacyCall(legacyName, { project: 'test', extra: 123 });
      expect(result.tool).toBe(mapping.tool);
      expect(result.action).toBe(mapping.action);
      expect(result.transformedArgs.action).toBe(mapping.action);
      expect(result.transformedArgs.project).toBe('test');
    }
  });

  it('should throw MethodNotFound for all removed tools', () => {
    for (const legacyName of Object.keys(REMOVED_TOOLS)) {
      expect(() => translateLegacyCall(legacyName, {})).toThrow();
    }
  });

  it('should throw MethodNotFound for unknown tools', () => {
    expect(() => translateLegacyCall('completely_unknown_tool', {})).toThrow('Unknown legacy tool');
  });

  it('should handle custom transforms like impact_analysis', () => {
    const res = translateLegacyCall('impact_analysis', { node_id: 'node-1' });
    expect(res.tool).toBe('query_graph');
    expect(res.action).toBe('trace');
    expect(res.transformedArgs.direction).toBe('downstream');
  });
});
