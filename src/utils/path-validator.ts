import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ValidationError } from './errors.js';

export interface PathValidationConfig {
  allowedDirs: string[]; // list of allowed base directories
  allowCreate?: boolean; // allow creating target if it doesn't exist
  mustExist?: boolean; // require target already exists
}

/**
 * Returns the default allowed directories: the project root and the user's home state-memory-mcp backups folder.
 */
export function getDefaultAllowedDirs(projectRoot: string): string[] {
  const absoluteProjectRoot = path.resolve(projectRoot);
  const backupsDir = path.resolve(os.homedir(), '.state-memory-mcp', 'backups');
  return [absoluteProjectRoot, backupsDir];
}

/**
 * Loads the path validation configuration, merging defaults with any user-configured allowedExportDirs.
 */
export function loadPathConfig(projectRoot: string): PathValidationConfig {
  const allowedDirs = getDefaultAllowedDirs(projectRoot);

  // Load from the standard configuration file .state-memory-mcp.json at the project root
  const configPath = path.join(projectRoot, '.state-memory-mcp.json');
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.allowedExportDirs)) {
        for (const dir of parsed.allowedExportDirs) {
          if (typeof dir === 'string') {
            allowedDirs.push(path.resolve(dir));
          }
        }
      }
    } catch {
      // Fallback silently if config doesn't exist or is invalid JSON
    }
  }

  return {
    allowedDirs: Array.from(new Set(allowedDirs)), // Deduplicate
  };
}

/**
 * Validates that a user-provided path is safe and resolves within one of the allowed directories.
 * Resolves symlinks via fs.realpathSync() before comparison to prevent symlink bypass.
 */
export function validatePath(userPath: string, config: PathValidationConfig): string {
  // 1. Resolve to absolute path
  let resolvedPath = path.resolve(userPath);

  // Reject paths containing explicit '..' segments
  const normPath = path.normalize(userPath);
  if (userPath.includes('..') || normPath.split(path.sep).includes('..')) {
    throw new ValidationError(`Path traversal detected: path "${userPath}" contains ".." segments`);
  }

  // 2. Resolve symlinks using the longest existing ancestor path
  let checkPath = resolvedPath;
  while (checkPath && checkPath !== path.parse(checkPath).root) {
    if (fs.existsSync(checkPath)) {
      try {
        const real = fs.realpathSync(checkPath);
        const relativePart = path.relative(checkPath, resolvedPath);
        resolvedPath = path.resolve(real, relativePart);
      } catch {
        // Ignore realpath errors and proceed with resolved path
      }
      break;
    }
    checkPath = path.dirname(checkPath);
  }

  // Check again after symlink resolution for any sneaky relative path segments
  if (resolvedPath.split(path.sep).includes('..')) {
    throw new ValidationError(
      `Path traversal detected: resolved path "${resolvedPath}" contains relative segments`
    );
  }

  // 3. Check resolved path starts with one of the allowed base directories
  const isAllowed = config.allowedDirs.some((allowedDir) => {
    const relative = path.relative(allowedDir, resolvedPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });

  if (!isAllowed) {
    throw new ValidationError(
      `Access denied: path "${userPath}" (resolved to "${resolvedPath}") is outside the allowed directories: ${config.allowedDirs.join(', ')}`
    );
  }

  // 4. Validate existence constraints
  const exists = fs.existsSync(resolvedPath);
  if (config.mustExist && !exists) {
    throw new ValidationError(`Target path does not exist: "${resolvedPath}"`);
  }

  if (config.allowCreate === false && !exists) {
    throw new ValidationError(`Creating new files is not allowed at path: "${resolvedPath}"`);
  }

  return resolvedPath;
}
