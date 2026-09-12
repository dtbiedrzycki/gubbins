import type { Logger } from '../application/ports/Logger.js';

/** Placeholder Logger — real pino/OpenTelemetry wiring (ADR-030) is sub-project 6. */
export class ConsoleLogger implements Logger {
  logInfo(message: string, meta?: Record<string, unknown>): void {
    console.log(JSON.stringify({ level: 'info', message, ...meta }));
  }
}
