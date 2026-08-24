/**
 * Post-ingest smoke check.
 *
 * Asserts the invariants the API depends on: the data landed, the ingest is
 * idempotent, and — the part that silently regresses — that both query shapes
 * still reach an index. A missed index here degrades to a sequential scan that
 * passes every functional test and only shows up as latency in production.
 *
 *   npm run db:verify -- --expect-rows 9
 */
import { Pool } from 'pg';
import { loadEnv, waitForDatabase } from './env';

/**
 * Below this, the planner rightly prefers a sequential scan and plan-shape
 * assertions become noise. The committed fixture is nine rows; a real ingest is
 * ~41,000.
 */
const PLAN_ASSERTION_MIN_ROWS = 1_000;

const checks: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
}

async function main() {
  loadEnv();

  const expectIndex = process.argv.indexOf('--expect-rows');
  const expectedRows =
    expectIndex !== -1 ? Number(process.argv[expectIndex + 1]) : null;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  await waitForDatabase(pool);

  try {
    const { rows: countRows } = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM locations',
    );
    const rowCount = Number(countRows[0].count);

    check(
      'locations populated',
      expectedRows === null ? rowCount > 0 : rowCount === expectedRows,
      expectedRows === null
        ? `${rowCount} rows`
        : `${rowCount} rows, expected ${expectedRows}`,
    );

    const { rows: indexRows } = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'locations'`,
    );
    const indexes = new Set(indexRows.map((r) => r.indexname));

    for (const name of [
      'locations_location_idx',
      'locations_city_prefix_idx',
      'locations_zip_prefix_idx',
    ]) {
      check(`index ${name} exists`, indexes.has(name), [...indexes].join(', '));
    }

    // On a small fixture a sequential scan is the *correct* plan — nine rows
    // are cheaper to scan than to look up — so asserting that the planner picks
    // the index only means something at realistic volume. Below the threshold
    // we disable seqscan and assert the weaker but still useful property: the
    // index is compatible with the query shape at all. That is what catches a
    // wrong opclass, which is the failure mode worth guarding here.
    const atVolume = rowCount >= PLAN_ASSERTION_MIN_ROWS;
    const suffix = atVolume ? 'planner chooses' : 'index is usable by';

    const knnPlan = await explain(
      pool,
      `SELECT zip FROM locations
       ORDER BY location <-> ST_MakePoint(-71.06, 42.36)::geography
       LIMIT 1`,
      atVolume,
    );
    check(
      `reverse geocode — ${suffix} the GiST index`,
      knnPlan.includes('locations_location_idx'),
      firstPlanLine(knnPlan),
    );

    const prefixPlan = await explain(
      pool,
      `SELECT city FROM locations WHERE lower(city) LIKE 'bos%' LIMIT 10`,
      atVolume,
    );
    check(
      `autocomplete — ${suffix} the city prefix index`,
      prefixPlan.includes('locations_city_prefix_idx'),
      firstPlanLine(prefixPlan),
    );

    const { rows: dupRows } = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM (
         SELECT zip FROM locations GROUP BY zip HAVING count(*) > 1
       ) dups`,
    );
    check(
      'zip is unique after repeated ingest',
      Number(dupRows[0].count) === 0,
      `${dupRows[0].count} duplicate zips`,
    );

    const { rows: coordRows } = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM locations
       WHERE ST_Y(location::geometry) NOT BETWEEN -90 AND 90
          OR ST_X(location::geometry) NOT BETWEEN -180 AND 180`,
    );
    check(
      'all coordinates are in range',
      Number(coordRows[0].count) === 0,
      `${coordRows[0].count} out of range`,
    );
  } finally {
    await pool.end();
  }

  for (const { name, ok, detail } of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed`);
    process.exit(1);
  }
  console.log(`\nall ${checks.length} checks passed`);
}

/**
 * EXPLAIN, not EXPLAIN ANALYZE: the plan shape is the assertion, and timings
 * would be flaky on a shared CI runner.
 *
 * With `trustPlanner` false, seqscan is disabled for the statement so the plan
 * shows whether the index *can* serve the query rather than whether it is the
 * cheapest option at this row count.
 */
async function explain(
  pool: Pool,
  sql: string,
  trustPlanner: boolean,
): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!trustPlanner) {
      await client.query('SET LOCAL enable_seqscan = off');
    }
    const { rows } = await client.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN ${sql}`,
    );
    await client.query('ROLLBACK');
    return rows.map((r) => r['QUERY PLAN']).join('\n');
  } finally {
    client.release();
  }
}

function firstPlanLine(plan: string): string {
  return plan.split('\n')[0]?.trim() ?? '';
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
