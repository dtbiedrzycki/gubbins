import { createDb } from '../infrastructure/db/createDb.js';
import { migrateToLatest } from '../infrastructure/db/migrate.js';
import { buildDependencies } from './compositionRoot.js';
import { buildApp } from './app.js';
import { disposeWithApp } from './lifecycle.js';

/**
 * The API contract (ADR-0077): the OpenAPI document @fastify/swagger derives
 * from the route schemas, pretty-printed with a trailing newline so the
 * committed file diffs cleanly. Builds the app against a throwaway in-memory
 * database and never listens on a port.
 */
export async function generateOpenApiDocument(): Promise<string> {
  const db = createDb(':memory:');
  await migrateToLatest(db);
  const app = buildApp(buildDependencies(db), { cookieSecret: 'openapi-generation-only' });
  disposeWithApp(app, db);
  try {
    await app.ready();
    return JSON.stringify(app.swagger(), null, 2) + '\n';
  } finally {
    await app.close();
  }
}
