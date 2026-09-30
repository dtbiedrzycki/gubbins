export interface Logger {
  logInfo(message: string, meta?: Record<string, unknown>): void;
  logWarn(message: string, meta?: Record<string, unknown>): void;
  logError(message: string, meta?: Record<string, unknown>): void;
}
