import { Module } from '@nestjs/common';
import {
  DeveloperController,
  DeveloperOauthController,
  MarketplaceController,
} from './developer.controller.js';
import { DeveloperService } from './developer.service.js';

@Module({
  controllers: [
    DeveloperController,
    DeveloperOauthController,
    MarketplaceController,
  ],
  providers: [DeveloperService],
  exports: [DeveloperService],
})
export class DeveloperModule {}
