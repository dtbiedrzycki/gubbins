import { fileURLToPath } from 'node:url';
import { createDb } from '../infrastructure/db/createDb.js';
import { migrateToLatest } from '../infrastructure/db/migrate.js';
import { buildDependencies } from './compositionRoot.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const databasePath = process.env.DATABASE_PATH ?? './data/wishlist.db';
  const port = Number(process.env.PORT ?? 3000);
  const cookieSecret = process.env.SESSION_COOKIE_SECRET;
  if (!cookieSecret) {
    console.warn('SESSION_COOKIE_SECRET is not set — using an insecure development default. Set it in .env before deploying.');
  }

  const db = createDb(databasePath);
  await migrateToLatest(db);
  const deps = buildDependencies(db);
  const app = buildApp(deps, {
    cookieSecret: cookieSecret ?? 'dev-only-insecure-secret-change-me',
    webDist: process.env.WEB_DIST ?? fileURLToPath(new URL('../../../web/dist', import.meta.url)),
  });

  await app.listen({ port, host: '0.0.0.0' });
  console.log(`gubbins listening on port ${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
