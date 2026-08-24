/**
 * Loads the GeoNames US postal-code dataset into `locations`.
 *
 * Repeatable by design: the archive is cached on disk, rows are streamed rather
 * than buffered, and the write is an upsert keyed on `zip`. Running it twice
 * produces the same table, so the same script works as a nightly refresh.
 *
 *   npm run db:ingest                # download (or reuse ./data/US.txt)
 *   npm run db:ingest -- --sample    # use the committed fixture, no network
 *   npm run db:ingest -- --truncate  # replace the table rather than merge into it
 */
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { Pool, type PoolClient } from 'pg';
import { loadEnv, waitForDatabase } from './env';
import { parseLine, type Row, type SkipReason } from './parse-row';

const DATA_DIR = join(__dirname, '..', '..', 'data');
const DATA_FILE = join(DATA_DIR, 'US.txt');
const SAMPLE_FILE = join(DATA_DIR, 'sample.txt');
const BATCH_SIZE = 1_000;

async function download(url: string): Promise<void> {
  console.log(`  fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);

  const zipped = Buffer.from(await res.arrayBuffer());
  await mkdir(DATA_DIR, { recursive: true });

  // The archive holds US.txt plus a readme; extract just the data file.
  // GeoNames writes the archive in streaming mode (general-purpose bit 3), so
  // entry sizes live in the central directory rather than the local headers —
  // hence a real zip reader rather than a hand-rolled one.
  const entry = new AdmZip(zipped).getEntry('US.txt');
  if (!entry) throw new Error('US.txt not found in archive');

  const data = entry.getData();
  await writeFile(DATA_FILE, data);

  console.log(`  extracted US.txt (${(data.length / 1e6).toFixed(1)} MB)`);
}

async function flush(client: PoolClient, rows: Row[]): Promise<void> {
  if (rows.length === 0) return;

  // One multi-row INSERT per batch: 1000 round trips become one.
  const values: unknown[] = [];
  const tuples = rows.map((r, i) => {
    const p = i * 6;
    values.push(r.zip, r.city, r.stateCode, r.stateName, r.lng, r.lat);
    return `($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, ST_MakePoint($${p + 5}, $${p + 6})::geography)`;
  });

  await client.query(
    `INSERT INTO locations (zip, city, state_code, state_name, location)
     VALUES ${tuples.join(', ')}
     ON CONFLICT (zip) DO UPDATE SET
       city       = EXCLUDED.city,
       state_code = EXCLUDED.state_code,
       state_name = EXCLUDED.state_name,
       location   = EXCLUDED.location,
       updated_at = now()`,
    values,
  );
}

async function main() {
  loadEnv();
  const useSample = process.argv.includes('--sample');
  const truncate = process.argv.includes('--truncate');
  const started = Date.now();

  const source = useSample ? SAMPLE_FILE : DATA_FILE;
  if (useSample) {
    console.log('  using committed sample fixture');
  } else if (existsSync(DATA_FILE)) {
    console.log('  using cached data/US.txt');
  } else {
    await download(process.env.GEONAMES_URL ?? 'https://download.geonames.org/export/zip/US.zip');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await waitForDatabase(pool);

  const client = await pool.connect();

  // Opt-in, never implied by --sample. The ingest is an upsert, so loading the
  // fixture over a full import leaves the two merged and row counts that look
  // wrong for either. Destructive, so it has to be asked for explicitly.
  if (truncate) {
    const { rows } = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM locations',
    );
    await client.query('TRUNCATE locations RESTART IDENTITY');
    console.log(`  truncated ${Number(rows[0].count).toLocaleString()} existing rows`);
  }

  let parsed = 0;
  let upserted = 0;
  let batch: Row[] = [];
  const skipped: Record<SkipReason, number> = {
    malformed: 0,
    no_state_code: 0,
    bad_coordinates: 0,
  };

  try {
    const lines = createInterface({
      input: createReadStream(source, 'utf8'),
      crlfDelay: Infinity,
    });

    for await (const line of lines) {
      if (!line.trim()) continue;
      parsed++;

      const row = parseLine(line);
      if (typeof row === 'string') {
        skipped[row]++;
        continue;
      }

      batch.push(row);
      if (batch.length >= BATCH_SIZE) {
        await flush(client, batch);
        upserted += batch.length;
        batch = [];
      }
    }

    await flush(client, batch);
    upserted += batch.length;
  } finally {
    client.release();
    await pool.end();
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const totalSkipped = Object.values(skipped).reduce((a, b) => a + b, 0);

  console.log(
    `  ${parsed.toLocaleString()} parsed · ${upserted.toLocaleString()} upserted · ` +
      `${totalSkipped.toLocaleString()} skipped · ${elapsed}s`,
  );

  for (const [reason, count] of Object.entries(skipped)) {
    if (count > 0) console.log(`    skipped ${count.toLocaleString()} — ${reason}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
