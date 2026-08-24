# Working in this repository

Guidance for AI-assisted development. Read before changing code.

## What this is

A US ZIP-code geocoding service. NestJS on Fastify, PostgreSQL with PostGIS,
React with Leaflet. npm workspaces: `server/` and `web/`.

## Commands

```bash
npm run dev                  # api :3000, web :5173
npm run db:reset             # migrate, then ingest the full dataset
npm run db:verify            # assert schema, indexes and query plans
npm run test:all             # every layer
```

`npm run db:ingest -- --sample` loads the 12-row fixture. It **upserts**, so
running it over a full import merges the two — add `--truncate` to replace.

## Invariants

Break these and the tests may still pass.

**SQL stays in `geocoding.repository.ts`.** The queries are index-sensitive. A
query builder makes it easy to lose the GiST plan, and losing it costs nothing
visible — every behavioural test still passes, the endpoint just gets slower.

**`text_pattern_ops` on the prefix indexes is load-bearing.** Without that
opclass the default btree will not serve `LIKE 'bos%'` in a non-C locale and
the planner falls back to a sequential scan. `db:verify` asserts this.

**`ST_MakePoint` takes longitude first.** The HTTP contract is `lat` then
`lng`. Transposition reads naturally in review, so it is covered explicitly in
`client.integration.test.ts` and `geocoding.service.spec.ts`.

**Reverse geocoding is bounded at 100 km.** Nearest-centroid always returns
something; the bound is what makes a click in open ocean report `ZERO_RESULTS`.

**`ZERO_RESULTS` is a 200.** Finding nothing is an answer. A 404 would mean the
endpoint does not exist.

## Which test layer

| Change | Layer | File |
| ------ | ----- | ---- |
| Parsing, validation, query classification | server unit | `*.spec.ts` beside the source |
| SQL, or anything about a query plan | API integration | `server/test/` |
| Component behaviour — debounce, keyboard | web component | `*.test.tsx` |
| How a request is built or a response read | UI integration | `*.integration.test.ts(x)` |
| Anything needing a real browser | e2e | `web/e2e/` |

Prove a new test can fail. Mutate the behaviour it covers, watch it go red,
restore. A test that passes either way is worse than no test — it reads as
coverage.

## Traps that cost time here

**`incremental: true` + `--noEmit`.** The typecheck leaves build info claiming
the project is current, after which `nest build` silently emits nothing.
`incremental` is deliberately absent from `server/tsconfig.json`.

**jsdom's `AbortController` is not Node's.** Node's `fetch` validates the
signal with an `instanceof` check against its own class, so any request
carrying a signal throws *"Expected signal to be an instance of AbortSignal"*.
The UI integration suite runs on **happy-dom** for this reason; the component
suite stays on jsdom because it never reaches `fetch`.

**Vitest transforms with esbuild, which emits no decorator metadata.** Nest
resolves every injected dependency to `undefined` and every request 500s. The
API integration suite uses `unplugin-swc` — that is the only reason it is a
dependency.

**Leaflet's `Icon.Default` prepends its auto-detected `imagePath`** to whatever
URL it is given, doubling the bundled asset path. `MapView` defines an explicit
`L.Icon`. A broken image is still an `<img>`, so assert `naturalWidth`, not
presence.

**`pg_isready` reports ready during `initdb`.** The official image runs a
temporary server first. Scripts call `waitForDatabase` and wait for a real
query rather than trusting the container.

**`Number('')` is `0`, not `NaN`.** A blank coordinate column passed every
range check and wrote the row to 0,0. `parse-row.ts` guards this.

## Conventions

- Commit messages say what changed and why, in prose. One concern per commit.
- One PR per ticket, merged with a merge commit so the individual commits
  survive on `main`.
- Comments explain *why*, never *what*. If a line needs a comment to say what
  it does, rewrite the line.
- Run the CI steps locally before pushing — `npm run test:all` plus
  `npm run db:verify`.
