import { describe, it, expect, vi } from 'vitest';
import { doctorAction } from '../../src/cli/commands/doctor.js';

describe('Doctor Command (doctorAction)', () => {
  it('should run environment health checks without throwing errors', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await doctorAction({});

    expect(consoleSpy).toHaveBeenCalled();
    const calls = consoleSpy.mock.calls.map((c) => c.join(' '));
    const summaryCall = calls.find((msg) => msg.includes('Health Check Summary'));
    expect(summaryCall).toBeDefined();

    consoleSpy.mockRestore();
  });
});
