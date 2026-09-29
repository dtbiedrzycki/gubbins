import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { createDb } from '../infrastructure/db/createDb.js';
import { migrateToLatest } from '../infrastructure/db/migrate.js';
import { buildDependencies } from './compositionRoot.js';
import { buildApp } from './app.js';
import { ConsoleLogger } from '../infrastructure/ConsoleLogger.js';
import type { Logger } from '../application/ports/Logger.js';
import { reportStartupFailure } from './reportStartupFailure.js';
import { closeOnSignals, disposeWithApp } from './lifecycle.js';

// Module scope rather than local to main(), so the failure handler below can
// tell whether the logger was built before the failure.
let logger: Logger | undefined;

async function main(): Promise<void> {
  logger = new ConsoleLogger();
  const databasePath = process.env.DATABASE_PATH ?? './data/wishlist.db';
  const port = Number(process.env.PORT ?? 3000);
  const cookieSecret = process.env.SESSION_COOKIE_SECRET;
  if (!cookieSecret) {
    logger.logWarn('session_cookie_secret_missing', {
      detail: 'Using an insecure development default. Set SESSION_COOKIE_SECRET in .env before deploying.',
    });
  }

  const db = createDb(databasePath);
  let app: FastifyInstance | undefined;
  try {
    await migrateToLatest(db);
    const deps = buildDependencies(db, logger);
    app = buildApp(deps, {
      cookieSecret: cookieSecret ?? 'dev-only-insecure-secret-change-me',
      webDist: process.env.WEB_DIST ?? fileURLToPath(new URL('../../../web/dist', import.meta.url)),
    });
    disposeWithApp(app, db);
    closeOnSignals(app, logger);

    await app.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    // Release what was opened before the failure: once the app exists,
    // closing it also destroys the database (disposeWithApp); before
    // that, the database is the only thing to close. A failure here is
    // logged rather than thrown, so it cannot mask the original error.
    await (app ? app.close() : db.destroy()).catch((cleanupErr: unknown) => {
      logger?.logError('startup_cleanup_failed', { error: String(cleanupErr) });
    });
    throw err;
  }
  logger.logInfo('server_listening', { port });
}

main().catch((err) => {
  reportStartupFailure(err, logger);
  process.exit(1);
});
