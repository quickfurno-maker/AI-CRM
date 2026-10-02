import { Module } from '@nestjs/common';
import { RealEstateController } from './real-estate.controller.js';
import { RealEstateService } from './real-estate.service.js';

@Module({
  controllers: [RealEstateController],
  providers: [RealEstateService],
  exports: [RealEstateService],
})
export class RealEstateModule {}
