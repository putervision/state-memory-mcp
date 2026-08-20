import { defineConfig } from 'tsup';
import * as fs from 'fs';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts', 'src/lib.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: true,
  external: [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.optionalDependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
