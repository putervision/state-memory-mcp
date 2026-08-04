import { describe, it, expect, afterAll } from 'vitest';
import { doctorAction } from '../../src/cli/commands/doctor.js';
import { closeAllDbs } from '../../src/engine/db.js';

describe('CLI Doctor Command Coverage', () => {
  afterAll(() => {
    closeAllDbs();
  });

  it('should execute doctorAction without throwing errors', async () => {
    await expect(doctorAction({ project: 'doctor-test-project' })).resolves.not.toThrow();
  });
});
