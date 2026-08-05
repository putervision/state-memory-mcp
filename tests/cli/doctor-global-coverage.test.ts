import { describe, it, expect, afterAll } from 'vitest';
import { doctorGlobalAction, doctorAction } from '../../src/cli/commands/doctor.js';
import { closeAllDbs } from '../../src/engine/db.js';

describe('CLI Doctor Global Command Coverage Suite', () => {
  afterAll(() => {
    closeAllDbs();
  });

  it('should run doctorGlobalAction without throwing errors', async () => {
    await expect(doctorGlobalAction()).resolves.not.toThrow();
  });

  it('should run doctorAction with --global flag without throwing errors', async () => {
    await expect(doctorAction({ global: true })).resolves.not.toThrow();
  });
});
