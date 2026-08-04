import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli.ts',
        'src/index.ts',
        'src/lib.ts',
        'src/server.ts',
        'src/cli/commands/inspect.ts',
        'src/cli/commands/other-actions.ts',
        'src/cli/commands/update.ts',
        'src/cli/helper.ts',
        'src/schema/types.ts',
        'src/engine/analytics.ts',
      ],
    },
  },
});
