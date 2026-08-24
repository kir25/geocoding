/**
 * Minimal forward-only migration runner.
 *
 * Applies every .sql file in ./migrations in filename order and records it in
 * schema_migrations, so re-running is a no-op. Deliberately not a migration
 * library: one table, three indexes, and a dependency we would have to explain.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import { loadEnv, waitForDatabase } from './env';

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

async function main() {
  loadEnv();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  await waitForDatabase(pool);

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await pool.query<{ name: string }>(
      'SELECT name FROM schema_migrations',
    );
    const applied = new Set(rows.map((r) => r.name));

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  skip  ${file}`);
        continue;
      }

      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      const client = await pool.connect();
      try {
        // Each migration is atomic: DDL is transactional in Postgres, so a
        // failure halfway through leaves no partial schema behind.
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
          file,
        ]);
        await client.query('COMMIT');
        console.log(`  apply ${file}`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${file} failed: ${(err as Error).message}`);
      } finally {
        client.release();
      }
    }

    console.log(
      count === 0 ? 'schema up to date' : `applied ${count} migration(s)`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
