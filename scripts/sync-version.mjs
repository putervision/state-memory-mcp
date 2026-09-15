#!/usr/bin/env node

/**
 * sync-version.mjs
 * 
 * Synchronizes the project version from package.json (or via bump directive) across:
 * - package.json
 * - package-lock.json
 * - manifest.json (and mcpb-build/manifest.json)
 * - server.json (top-level and packages[].version)
 * - docs/.well-known/mcp.json (version, packages[].version, servers[].version)
 * - src/utils/version.ts
 * - src/server.ts (if hardcoded)
 * - src/cli.ts (fallback or hardcoded pkgVersion)
 * - README.md (version badge, npm pkg tags, headings)
 * - docs/index.html (softwareVersion, hero badges, header versions, meta tags)
 * - docs/api-reference.md & docs/tools-reference.md (heading versions)
 * - docs/game-demo.html (demo version config)
 * - MIGRATION.md (migration guide headers)
 * - docs/**\/*.md (version badges)
 * 
 * Usage:
 *   node scripts/sync-version.mjs           # Sync project to match package.json version
 *   node scripts/sync-version.mjs patch     # Bump patch in package.json and sync
 *   node scripts/sync-version.mjs minor     # Bump minor in package.json and sync
 *   node scripts/sync-version.mjs major     # Bump major in package.json and sync
 *   node scripts/sync-version.mjs 1.2.1     # Set explicit version in package.json and sync
 *   node scripts/sync-version.mjs --check   # Verify all files match package.json (exit 1 if drift)
 *   node scripts/sync-version.mjs --dry-run # Preview changes without writing
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(PROJECT_ROOT, '..');

const args = process.argv.slice(2);
const isCheckMode = args.includes('--check');
const isDryRun = args.includes('--dry-run');
const targetArg = args.find(a => !a.startsWith('--'));

const pkgPath = path.join(PROJECT_ROOT, 'package.json');
if (!fs.existsSync(pkgPath)) {
  console.error(`[ERROR] package.json not found at ${pkgPath}`);
  process.exit(1);
}

const pkgRaw = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(pkgRaw);

function bumpVersion(current, type) {
  const parts = current.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid semver: ${current}`);
  }
  let [major, minor, patch] = parts;
  if (type === 'patch') patch += 1;
  else if (type === 'minor') { minor += 1; patch = 0; }
  else if (type === 'major') { major += 1; minor = 0; patch = 0; }
  else if (/^\d+\.\d+\.\d+.*$/.test(type)) return type;
  else throw new Error(`Unknown bump directive: ${type}`);
  return `${major}.${minor}.${patch}`;
}

let targetVersion = pkg.version;
let pkgModified = false;

if (targetArg) {
  const newVer = bumpVersion(pkg.version, targetArg);
  if (newVer !== pkg.version) {
    targetVersion = newVer;
    pkg.version = newVer;
    pkgModified = true;
  }
}

const updatedFiles = [];
const driftFiles = [];

function recordChange(file, changed) {
  if (changed) {
    updatedFiles.push(file);
    if (isCheckMode) driftFiles.push(file);
  }
}

function updateFileContent(relPath, transformFn) {
  const fullPath = path.join(PROJECT_ROOT, relPath);
  if (!fs.existsSync(fullPath)) return;
  const original = fs.readFileSync(fullPath, 'utf8');
  const updated = transformFn(original);
  if (original !== updated) {
    recordChange(relPath, true);
    if (!isCheckMode && !isDryRun) {
      fs.writeFileSync(fullPath, updated, 'utf8');
    }
  }
}

function updateJsonFile(relPath, transformFn) {
  const fullPath = path.join(PROJECT_ROOT, relPath);
  if (!fs.existsSync(fullPath)) return;
  try {
    const originalText = fs.readFileSync(fullPath, 'utf8');
    const originalJson = JSON.parse(originalText);
    const modifiedJson = transformFn(JSON.parse(originalText));
    const newText = JSON.stringify(modifiedJson, null, 2) + '\n';
    if (originalText !== newText) {
      recordChange(relPath, true);
      if (!isCheckMode && !isDryRun) {
        fs.writeFileSync(fullPath, newText, 'utf8');
      }
    }
  } catch (err) {
    console.error(`[WARN] Failed to process JSON for ${relPath}: ${err.message}`);
  }
}

// 1. package.json (if bumped via CLI argument)
if (pkgModified) {
  recordChange('package.json', true);
  if (!isCheckMode && !isDryRun) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  }
}

// 2. package-lock.json
updateJsonFile('package-lock.json', (lock) => {
  lock.version = targetVersion;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = targetVersion;
  }
  return lock;
});

// 3. manifest.json and mcpb-build/manifest.json
for (const mPath of ['manifest.json', 'mcpb-build/manifest.json']) {
  updateJsonFile(mPath, (manifest) => {
    manifest.version = targetVersion;
    return manifest;
  });
}

// 4. server.json
updateJsonFile('server.json', (server) => {
  server.version = targetVersion;
  if (Array.isArray(server.packages)) {
    server.packages.forEach(p => {
      p.version = targetVersion;
    });
  }
  return server;
});

// 5. docs/.well-known/mcp.json
updateJsonFile('docs/.well-known/mcp.json', (mcp) => {
  if (mcp.version) {
    mcp.version = targetVersion;
  }
  if (Array.isArray(mcp.packages)) {
    mcp.packages.forEach(p => {
      p.version = targetVersion;
    });
  }
  if (Array.isArray(mcp.servers)) {
    const getSiblingVersion = (repoName) => {
      try {
        const p = path.join(WORKSPACE_ROOT, repoName, 'package.json');
        if (fs.existsSync(p)) {
          return JSON.parse(fs.readFileSync(p, 'utf8')).version;
        }
      } catch {}
      return null;
    };
    
    mcp.servers.forEach(srv => {
      if (srv.id === path.basename(PROJECT_ROOT) || srv.package === pkg.name) {
        srv.version = targetVersion;
      } else {
        const sibVer = getSiblingVersion(srv.id);
        if (sibVer) srv.version = sibVer;
      }
    });
  }
  return mcp;
});

// 6. src/utils/version.ts
updateFileContent('src/utils/version.ts', (content) => {
  return content
    .replace(/:\s*['"][0-9]+\.[0-9]+\.[0-9]+[^'"]*['"]/g, `: '${targetVersion}'`)
    .replace(/return\s*['"][0-9]+\.[0-9]+\.[0-9]+[^'"]*['"]/g, `return '${targetVersion}'`);
});

// 7. src/server.ts
updateFileContent('src/server.ts', (content) => {
  return content.replace(
    /version:\s*['"][0-9]+\.[0-9]+\.[0-9]+[^'"]*['"]/g,
    `version: '${targetVersion}'`
  );
});

// 8. src/cli.ts
updateFileContent('src/cli.ts', (content) => {
  return content
    .replace(/pkgVersion\s*=\s*['"][0-9]+\.[0-9]+\.[0-9]+[^'"]*['"]/g, `pkgVersion = '${targetVersion}'`)
    .replace(/:\s*['"][0-9]+\.[0-9]+\.[0-9]+[^'"]*['"];/g, `: '${targetVersion}';`);
});

// 9. README.md
updateFileContent('README.md', (content) => {
  let updated = content;
  // Version badge
  const badgePattern = /\[!\[version\]\(https:\/\/img\.shields\.io\/badge\/version-[^)]+\)\]\([^)]+\)/;
  const newBadge = `[![version](https://img.shields.io/badge/version-${targetVersion}-blue.svg)](./CHANGELOG.md)`;
  if (badgePattern.test(updated)) {
    updated = updated.replace(badgePattern, newBadge);
  } else {
    // Insert badge right after npm version badge
    const npmBadgeMatch = updated.match(/(\[!\[npm version\]\([^\n]+\n)/);
    if (npmBadgeMatch) {
      updated = updated.replace(npmBadgeMatch[1], `${npmBadgeMatch[1]}${newBadge}\n`);
    } else {
      updated = updated.replace(/^(#\s+[^\n]+\n+)/m, `$1${newBadge}\n\n`);
    }
  }
  
  // Update shields badge patterns like version-X.Y.Z-
  updated = updated.replace(/badge\/version-[0-9]+\.[0-9]+\.[0-9]+[^ -]*-/g, `badge/version-${targetVersion}-`);
  
  // Package tags like @putervision/state-memory-mcp@X.Y.Z
  updated = updated.replace(
    new RegExp(`(${pkg.name.replace('/', '\\/')})@[0-9]+\\.[0-9]+\\.[0-9]+`, 'g'),
    `$1@${targetVersion}`
  );
  
  // Header version patterns like # Package (vX.Y.Z)
  updated = updated.replace(
    new RegExp(`(#\\s+${pkg.name.replace('/', '\\/')}\\s+\\()v[0-9]+\\.[0-9]+\\.[0-9]+(\\))`, 'g'),
    `$1v${targetVersion}$2`
  );
  
  return updated;
});

// 10. docs/index.html
updateFileContent('docs/index.html', (content) => {
  let updated = content;
  // Schema.org softwareVersion
  updated = updated.replace(/"softwareVersion":\s*"[0-9]+\.[0-9]+\.[0-9]+[^"]*"/g, `"softwareVersion": "${targetVersion}"`);
  // Hero badge: Production Ready v...
  updated = updated.replace(/Production Ready v[0-9]+\.[0-9]+\.[0-9]+[^ <]*/g, `Production Ready v${targetVersion}`);
  // Hero badge: RELEASE v...
  updated = updated.replace(/RELEASE v[0-9]+\.[0-9]+\.[0-9]+[^ <]*/g, `RELEASE v${targetVersion}`);
  // Hero subtitle: Model Context Protocol Server • v...
  updated = updated.replace(/Model Context Protocol Server • v[0-9]+\.[0-9]+\.[0-9]+[^ <]*/g, `Model Context Protocol Server • v${targetVersion}`);
  // Meta tag
  updated = updated.replace(/<meta\s+name="version"\s+content="[^"]*"/g, `<meta name="version" content="${targetVersion}"`);
  return updated;
});

// 11. docs/api-reference.md & docs/tools-reference.md
for (const docFile of ['docs/api-reference.md', 'docs/tools-reference.md']) {
  updateFileContent(docFile, (content) => {
    let updated = content;
    updated = updated.replace(/\(v[0-9]+\.[0-9]+\.[0-9]+ — /g, `(v${targetVersion} — `);
    updated = updated.replace(/Reference \(v[0-9]+\.[0-9]+\.[0-9]+\)/g, `Reference (v${targetVersion})`);
    return updated;
  });
}

// 12. docs/game-demo.html
updateFileContent('docs/game-demo.html', (content) => {
  return content.replace(/version:\s*'[0-9]+\.[0-9]+\.[0-9]+'/g, `version: '${targetVersion}'`);
});

// 13. MIGRATION.md
updateFileContent('MIGRATION.md', (content) => {
  return content.replace(/\*\*v[0-9]+\.[0-9]+\.[0-9]+\+ API\*\*/g, `**v${targetVersion}+ API**`);
});

// 14. Scan all docs/**/*.md for version badges
const docsDir = path.join(PROJECT_ROOT, 'docs');
if (fs.existsSync(docsDir)) {
  const scanDocs = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== '.state-memory-mcp') {
        scanDocs(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const rel = path.relative(PROJECT_ROOT, full);
        updateFileContent(rel, (content) => {
          return content.replace(/badge\/version-[0-9]+\.[0-9]+\.[0-9]+[^ -]*-/g, `badge/version-${targetVersion}-`);
        });
      }
    }
  };
  scanDocs(docsDir);
}

// 15. Summary & Exit
console.log(`\n========================================================`);
console.log(` Version Sync: ${pkg.name}`);
console.log(` Target Version: ${targetVersion}`);
console.log(` Mode: ${isCheckMode ? 'CHECK' : isDryRun ? 'DRY-RUN' : 'WRITE'}`);
console.log(`========================================================`);

if (isCheckMode) {
  if (driftFiles.length > 0) {
    console.error(`\n[DRIFT DETECTED] The following files are out of sync with version ${targetVersion}:`);
    driftFiles.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  } else {
    console.log(`\n[OK] All files are in sync with package.json version ${targetVersion}.`);
    process.exit(0);
  }
} else {
  if (updatedFiles.length > 0) {
    console.log(`\nSynchronized files:`);
    updatedFiles.forEach(f => console.log(`  ✓ ${f}`));
  } else {
    console.log(`\n[OK] All files were already in sync with package.json version ${targetVersion}.`);
  }
}
