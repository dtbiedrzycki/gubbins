import { sql, type Kysely, type QueryExecutorProvider } from 'kysely';
import { createDb } from './createDb.js';
import { runMigrations } from './runMigrations.js';

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
 * A migration is recorded by name, so one that is missing from this build, or
 * was edited after it was released, leaves the database in a shape no
 * migration will correct, and the first write that touches a changed column
 * fails as a 500 in front of a guest. This compares every table against what
 * the migrations build on a fresh in-memory database, so drift stops the
 * server at startup with a message that says what went wrong, instead.
 */
export async function assertSchemaMatches(db: QueryExecutorProvider): Promise<void> {
  const reference = createDb(':memory:');
  try {
    await runMigrations(reference as unknown as Kysely<unknown>);
    const expected = await columnsByTable(reference);
    const actual = await columnsByTable(db);
    for (const [table, columns] of expected) {
      const found = actual.get(table);
      if (found !== columns) {
        throw new StaleSchemaError(
          `Database schema doesn't match this build: table "${table}" has columns (${found ?? 'table missing'}) ` +
          `but this build expects (${columns}). A migration is missing, or one was edited after it was released. ` +
          'Deploy the release that last ran against this database, and don\'t change the database by hand.',
        );
      }
    }
  } finally {
    await reference.destroy();
  }
}
