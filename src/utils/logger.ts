type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const cachedLogLevel = (() => {
  const envLevel = process.env.STATE_GRAPH_MCP_LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (envLevel && envLevel in LOG_LEVELS) {
    return LOG_LEVELS[envLevel];
  }
  return LOG_LEVELS.info; // Default level
})();

const getLogLevel = (): number => cachedLogLevel;

export const logger = {
  debug: (message: string, ...args: unknown[]) => {
    if (getLogLevel() <= LOG_LEVELS.debug) {
      console.error(`[DEBUG] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: unknown[]) => {
    if (getLogLevel() <= LOG_LEVELS.info) {
      console.error(`[INFO] ${message}`, ...args);
    }
  },
  warn: (message: string, ...args: unknown[]) => {
    if (getLogLevel() <= LOG_LEVELS.warn) {
      console.error(`[WARN] ${message}`, ...args);
    }
  },
  error: (message: string, ...args: unknown[]) => {
    if (getLogLevel() <= LOG_LEVELS.error) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  },
};
