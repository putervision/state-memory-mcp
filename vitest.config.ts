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
        'src/cli/**',
        'src/index.ts',
        'src/lib.ts',
        'src/server.ts',
        'src/schema/types.ts',
        'src/engine/analytics.ts',
      ],
    },
  },
});
