import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { AutocompleteDto, GeocodeDto, ReverseDto } from './dto/query.dto';
import { GeocodingService } from './geocoding.service';
import type { AutocompleteResponse, GeocodeResponse } from './types';

@Controller()
export class GeocodingController {
  constructor(private readonly service: GeocodingService) {}

  /**
   * Lightweight predictions for the search box. Called on every keystroke, so
   * the payload carries an id and a display string only.
   */
  @Get('autocomplete')
  autocomplete(@Query() query: AutocompleteDto): Promise<AutocompleteResponse> {
    return this.service.autocomplete(query.q, query.limit);
  }

  /** Full result for a committed choice: by place_id, or by free-text query. */
  @Get('geocode')
  geocode(@Query() query: GeocodeDto): Promise<GeocodeResponse> {
    if (!query.q && !query.place_id) {
      throw new BadRequestException('either q or place_id is required');
    }

    return this.service.geocode({
      q: query.q,
      placeId: query.place_id,
      limit: query.limit,
    });
  }

  /** Coordinates to the nearest known location, with the distance to it. */
  @Get('reverse')
  reverse(@Query() query: ReverseDto): Promise<GeocodeResponse> {
    return this.service.reverse(query.lat, query.lng);
  }

  @Get('health')
  health(): { status: string; version: string } {
    return { status: 'ok', version: '1.0.0' };
  }
}
