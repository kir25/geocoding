import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import type { CityRow, LocationRow } from './types';

/**
 * All SQL lives here. The queries are index-sensitive — a query builder would
 * make it easy to lose the GiST KNN plan or the prefix index without noticing.
 */
@Injectable()
export class GeocodingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Shared projection. Coordinates come back as plain numbers, not WKB. */
  private static readonly COLUMNS = `
    zip, city, state_code, state_name,
    ST_Y(location::geometry) AS lat,
    ST_X(location::geometry) AS lng`;

  /**
   * City-level projection. A city spans many ZIPs (Boston has 36), so text
   * searches collapse to one row per city with the centroid of its ZIP points.
   */
  private static readonly CITY_COLUMNS = `
    city, state_code, state_name,
    count(*)::int AS zip_count,
    min(zip) AS zip,
    ST_Y(ST_Centroid(ST_Collect(location::geometry))) AS lat,
    ST_X(ST_Centroid(ST_Collect(location::geometry))) AS lng`;

  /**
   * City prefix match, ranked by ZIP count.
   *
   * The dataset carries no population or prominence column, so the number of
   * ZIPs a city spans stands in for size — without it "bos" surfaces Boss, MO
   * ahead of Boston, MA.
   */
  async findCitiesByPrefix(prefix: string, limit: number): Promise<CityRow[]> {
    const { rows } = await this.pool.query<CityRow>(
      `SELECT ${GeocodingRepository.CITY_COLUMNS}
       FROM locations
       WHERE lower(city) LIKE $1
       GROUP BY city, state_code, state_name
       ORDER BY count(*) DESC, length(city), city
       LIMIT $2`,
      [`${prefix.toLowerCase()}%`, limit],
    );
    return rows;
  }

  /** City prefix constrained to one state, for "Boston, MA" style input. */
  async findCitiesByPrefixAndState(
    prefix: string,
    stateCode: string,
    limit: number,
  ): Promise<CityRow[]> {
    const { rows } = await this.pool.query<CityRow>(
      `SELECT ${GeocodingRepository.CITY_COLUMNS}
       FROM locations
       WHERE lower(city) LIKE $1 AND state_code = $2
       GROUP BY city, state_code, state_name
       ORDER BY count(*) DESC, length(city), city
       LIMIT $3`,
      [`${prefix.toLowerCase()}%`, stateCode.toUpperCase(), limit],
    );
    return rows;
  }

  /** Exact city lookup, for resolving a us-city-* place_id. */
  async findCity(city: string, stateCode: string): Promise<CityRow | null> {
    const { rows } = await this.pool.query<CityRow>(
      `SELECT ${GeocodingRepository.CITY_COLUMNS}
       FROM locations
       WHERE lower(city) = $1 AND state_code = $2
       GROUP BY city, state_code, state_name`,
      [city.toLowerCase(), stateCode.toUpperCase()],
    );
    return rows[0] ?? null;
  }

  async findByZipPrefix(prefix: string, limit: number): Promise<LocationRow[]> {
    const { rows } = await this.pool.query<LocationRow>(
      `SELECT ${GeocodingRepository.COLUMNS}
       FROM locations
       WHERE zip LIKE $1
       ORDER BY zip
       LIMIT $2`,
      [`${prefix}%`, limit],
    );
    return rows;
  }

  async findByZip(zip: string): Promise<LocationRow | null> {
    const { rows } = await this.pool.query<LocationRow>(
      `SELECT ${GeocodingRepository.COLUMNS}
       FROM locations
       WHERE zip = $1`,
      [zip],
    );
    return rows[0] ?? null;
  }

  /**
   * Nearest location to a point.
   *
   * `<->` against the GiST index walks the tree in distance order and stops at
   * LIMIT, rather than sorting all 41k rows. ST_Distance then computes the exact
   * spheroid distance for the single row that survives.
   */
  async findNearest(lat: number, lng: number): Promise<LocationRow | null> {
    const { rows } = await this.pool.query<LocationRow>(
      `SELECT ${GeocodingRepository.COLUMNS},
              ST_Distance(location, ST_MakePoint($1, $2)::geography) AS distance_meters
       FROM locations
       ORDER BY location <-> ST_MakePoint($1, $2)::geography
       LIMIT 1`,
      [lng, lat],
    );
    return rows[0] ?? null;
  }
}
