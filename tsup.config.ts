import { defineConfig } from 'tsup';
import * as fs from 'fs';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  shims: true,
  sourcemap: true,
  splitting: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
