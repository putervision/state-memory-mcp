import * as fs from 'fs';
import * as path from 'path';
import { z, Infer } from '../schema/schemas.js';
import { logger } from '../utils/logger.js';
import { validatePath, loadPathConfig } from '../utils/path-validator.js';

export const ProjectConfigSchema = z.object({
  projectName: z.string().optional(),
  defaultBranch: z.string().optional(),
  storagePath: z.string().optional(),
  allowedExportDirs: z.array(z.string()).optional(),
  strictAudit: z.boolean().optional(),
});

export type ProjectConfig = {
  projectName?: string;
  defaultBranch?: string;
  storagePath?: string;
  allowedExportDirs?: string[];
  strictAudit?: boolean;
};

const configCache = new Map<string, { config: ProjectConfig; timestamp: number }>();
const CACHE_TTL_MS = 2000; // 2 seconds TTL

export function loadProjectConfig(projectRoot: string): ProjectConfig {
  const now = Date.now();
  const cached = configCache.get(projectRoot);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.config;
  }

  const config = loadProjectConfigDirect(projectRoot);
  configCache.set(projectRoot, { config, timestamp: now });
  return config;
}

function loadProjectConfigDirect(projectRoot: string): ProjectConfig {
  const configPath = path.join(projectRoot, '.state-memory-mcp.json');
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const result = ProjectConfigSchema.safeParse(parsed);
      if (result.success && result.data) {
        logger.debug(`Loaded configuration from ${configPath}`);

        const configData = result.data as any;
        // Validate storagePath to prevent path traversal (defense in depth)
        if (configData.storagePath) {
          const projectRootAbs = path.resolve(projectRoot);
          const pathConfig = loadPathConfig(projectRoot);
          const absStoragePath = path.resolve(projectRootAbs, configData.storagePath);
          try {
            validatePath(absStoragePath, pathConfig);
          } catch (err: any) {
            logger.warn(
              `Storage path traversal validation failed: ${err.message}. Falling back to default.`
            );
            configData.storagePath = undefined;
          }
        }

        return configData;
      } else {
        logger.warn(`Invalid configuration in ${configPath}:`, result.error?.format());
      }
    } catch (err: any) {
      logger.warn(`Failed to read/parse configuration from ${configPath}: ${err.message}`);
    }
  }
  return {};
}
