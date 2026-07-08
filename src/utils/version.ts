import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as path from 'path';

const __filename = fileURLToPath(import.meta.url);
let currentDir = path.dirname(__filename);
let packageVersion = '0.0.4'; // Fallback default version

try {
  while (true) {
    const pkgPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg && pkg.name === 'state-graph-mcp' && pkg.version) {
        packageVersion = pkg.version;
        break;
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break; // Reached system root
    }
    currentDir = parentDir;
  }
} catch (error) {
  // Gracefully ignore filesystem/parse errors and use fallback
}

export const VERSION = packageVersion;
