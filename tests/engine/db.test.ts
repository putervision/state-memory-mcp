import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import { DatabaseError } from '../../src/utils/errors.js';

const mockHomedir = path.resolve('/mock/home/user');

// Mock os module
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: () => '/mock/home/user',
  };
});

// Mock fs module
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

import * as fs from 'fs';

// Import under test after mocking
import { resolveProjectRoot, getProjectSlug } from '../../src/engine/db.js';

describe('Database Project Resolution Tests', () => {
  it('should ignore .state-memory-mcp when walking up if it is the home directory', () => {
    const existsSpy = vi.mocked(fs.existsSync);
    existsSpy.mockImplementation((p) => {
      // Simulate .state-memory-mcp existing in the mock home directory
      if (typeof p === 'string' && p.startsWith(path.join(mockHomedir, '.state-memory-mcp'))) {
        return true;
      }
      return false;
    });

    const root = resolveProjectRoot(undefined, path.join(mockHomedir, 'Downloads'));

    // It should NOT stop at mockHomedir since .state-memory-mcp is in home directory
    // Instead it walks all the way up to root and falls back to currentCwd
    expect(root).not.toBe(mockHomedir);

    existsSpy.mockReset();
  });

  it('should throw DatabaseError in getProjectSlug if resolved root is unregistered home directory', () => {
    const existsSpy = vi.mocked(fs.existsSync);
    existsSpy.mockImplementation((p) => {
      if (typeof p === 'string' && p.endsWith('.state-memory-mcp-registry.json')) {
        return false;
      }
      return false;
    });

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(mockHomedir);

    expect(() => {
      getProjectSlug(undefined);
    }).toThrow(DatabaseError);

    expect(() => {
      getProjectSlug(undefined);
    }).toThrow(/Could not auto-detect project name/);

    cwdSpy.mockRestore();
    existsSpy.mockReset();
  });
});
