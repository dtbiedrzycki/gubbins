import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Logger } from '../application/ports/Logger.js';
import type { Database } from '../infrastructure/db/schema.js';

/**
 * Ties the database's lifetime to the app's: closing the app destroys the
 * database handle. It is the only resource the composition root holds that
 * needs disposing. Every other dependency is stateless, and each transaction
 * is already opened and released inside `UnitOfWorkKysely.execute`.
 */
export function disposeWithApp(app: FastifyInstance, db: Kysely<Database>): void {
  app.addHook('onClose', async () => {
    await db.destroy();
  });
}

/**
 * Closes the app, and so everything registered with `disposeWithApp`, on
 * SIGTERM (container stop) or SIGINT (Ctrl-C). Fastify then stops
 * accepting connections and lets in-flight requests finish. Each signal is
 * handled once, so a second Ctrl-C falls back to Node's default and kills
 * the process at once if shutdown hangs.
 */
export function closeOnSignals(
  app: Pick<FastifyInstance, 'close'>,
  logger: Logger,
  signalSource: Pick<NodeJS.EventEmitter, 'once'> = process,
): void {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    signalSource.once(signal, () => {
      logger.logInfo('server_shutting_down', { signal });
      app.close().then(
        () => logger.logInfo('server_closed'),
        (err: unknown) => {
          logger.logError('shutdown_failed', err instanceof Error ? { error: err.message, stack: err.stack } : { error: String(err) });
          process.exitCode = 1;
        },
      );
    });
  }
}
