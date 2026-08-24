# Geocoding

US ZIP-code geocoding service: forward lookup with autocomplete, and reverse
geocoding from a pair of coordinates.

**Status:** scaffolding. See commit history for progress.

## Stack

| Layer    | Choice                          |
| -------- | ------------------------------- |
| Backend  | NestJS (Fastify adapter), TypeScript |
| Database | PostgreSQL 16 + PostGIS         |
| Frontend | React 19 + Vite, Leaflet + OpenStreetMap tiles |
| Data     | GeoNames US postal codes        |

## Running locally

```bash
npm install
cp .env.example .env
docker compose up -d      # Postgres + PostGIS
npm run db:reset          # migrate schema, then ingest the dataset
npm run dev               # api :3000, web :5173
```

## Technical decisions

_To be written._

## Known limitations

_To be written._
