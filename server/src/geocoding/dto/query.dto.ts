import { Type } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Query params arrive as strings; `@Type` plus the global ValidationPipe's
 * `transform` coerces them before validation, so a bad lat/lng is a 400 from
 * the framework rather than a NaN reaching SQL.
 */

export class AutocompleteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 10;
}

export class GeocodeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  place_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 10;
}

export class ReverseDto {
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lng!: number;
}
