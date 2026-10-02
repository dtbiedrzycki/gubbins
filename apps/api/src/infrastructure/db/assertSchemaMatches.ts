import { sql, type Kysely, type QueryExecutorProvider } from 'kysely';
import { createDb } from './createDb.js';
import { up } from './migrations/0001_init.js';

export class StaleSchemaError extends Error {}

/** Each table's column names in declaration order, joined — a cheap shape fingerprint. */
async function columnsByTable(db: QueryExecutorProvider): Promise<Map<string, string>> {
  const tables = await sql<{ name: string }>`
    select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name
  `.execute(db);
  const shape = new Map<string, string>();
  for (const { name } of tables.rows) {
    const columns = await sql<{ name: string }>`select name from pragma_table_info(${name}) order by cid`.execute(db);
    shape.set(name, columns.rows.map((c) => c.name).join(', '));
  }
  return shape;
}

/**
 * Until 1.0, 0001_init is amended in place rather than followed by new
 * migrations (holds-lifecycle D14), and its `createTable(...).ifNotExists()`
 * skips any table that already exists. A database an older build created
 * therefore keeps its old shape without complaint, and the first write that
 * touches a changed column fails as a 500 in front of a guest. This compares
 * every table against what the current migration builds on a fresh
 * in-memory database, so drift stops the server at startup with a message
 * that says what to do, instead.
 */
export async function assertSchemaMatches(db: QueryExecutorProvider): Promise<void> {
  const reference = createDb(':memory:');
  try {
    await up(reference as unknown as Kysely<unknown>);
    const expected = await columnsByTable(reference);
    const actual = await columnsByTable(db);
    for (const [table, columns] of expected) {
      const found = actual.get(table);
      if (found !== columns) {
        throw new StaleSchemaError(
          `Database schema is out of date: table "${table}" has columns (${found ?? 'table missing'}) ` +
          `but this build expects (${columns}). 0001_init is amended in place before 1.0, so recreate the ` +
          'database: stop the server, delete the file at DATABASE_PATH, and start it again.',
        );
      }
    }
  } finally {
    await reference.destroy();
  }
}
