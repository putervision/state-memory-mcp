import { describe, it, expect, afterAll } from 'vitest';
import { subprojectsAction } from '../../src/cli/commands/subprojects.js';
import { closeAllDbs } from '../../src/engine/db.js';

describe('CLI subprojectsAction Command', () => {
  const project = 'subprojects-cli-test-project';

  afterAll(() => {
    closeAllDbs();
  });

  it('should run subprojectsAction without throwing errors', async () => {
    expect(async () => {
      await subprojectsAction({ project });
    }).not.toThrow();
  });
});
