export interface Logger {
  logInfo(message: string, meta?: Record<string, unknown>): void;
}
