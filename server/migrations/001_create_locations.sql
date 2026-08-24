-- PostGIS gives us GEOGRAPHY(POINT) with metre-accurate distances on a sphere,
-- and a GiST index that the KNN operator (<->) can use for nearest-neighbour.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS locations (
  id         BIGSERIAL PRIMARY KEY,
  zip        TEXT NOT NULL UNIQUE,
  city       TEXT NOT NULL,
  state_code CHAR(2) NOT NULL,
  state_name TEXT NOT NULL,
  location   GEOGRAPHY(POINT, 4326) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reverse geocoding: ORDER BY location <-> point LIMIT 1.
-- Without this the planner sorts all ~41k rows on every map click.
CREATE INDEX IF NOT EXISTS locations_location_idx
  ON locations USING GIST (location);

-- Autocomplete: WHERE lower(city) LIKE 'bos%'.
-- text_pattern_ops is required for prefix matching to use the index in a
-- non-C locale; the default opclass would fall back to a sequential scan.
CREATE INDEX IF NOT EXISTS locations_city_prefix_idx
  ON locations (lower(city) text_pattern_ops);

CREATE INDEX IF NOT EXISTS locations_zip_prefix_idx
  ON locations (zip text_pattern_ops);
