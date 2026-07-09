import * as fs from 'fs';
import * as path from 'path';
import { z } from '../schema/schemas.js';
import { logger } from '../utils/logger.js';

export const ProjectConfigSchema = z.object({
  projectName: z.string().optional(),
  defaultBranch: z.string().optional(),
  storagePath: z.string().optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export function loadProjectConfig(projectRoot: string): ProjectConfig {
  const configPath = path.join(projectRoot, '.state-graph-mcp.json');
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const result = ProjectConfigSchema.safeParse(parsed);
      if (result.success) {
        logger.debug(`Loaded configuration from ${configPath}`);
        return result.data;
      } else {
        logger.warn(`Invalid configuration in ${configPath}:`, result.error.format());
      }
    } catch (err: any) {
      logger.warn(`Failed to read/parse configuration from ${configPath}: ${err.message}`);
    }
  }
  return {};
}
