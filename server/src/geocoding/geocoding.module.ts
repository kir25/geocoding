import { Module } from '@nestjs/common';
import { GeocodingController } from './geocoding.controller';
import { GeocodingRepository } from './geocoding.repository';
import { GeocodingService } from './geocoding.service';

@Module({
  controllers: [GeocodingController],
  providers: [GeocodingService, GeocodingRepository],
})
export class GeocodingModule {}
