import {
  Controller,
  ForbiddenException,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Principal } from '../../platform/auth/auth.types.js';
import { CurrentPrincipal } from '../../platform/auth/current-principal.decorator.js';
import { Public } from '../../platform/auth/public.decorator.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get('live')
  live() {
    return this.healthService.live();
  }

  @Public()
  @Get('ready')
  async ready() {
    const result = await this.healthService.ready();
    if (!result.ready) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        ...result,
      });
    }
    return { status: 'ready', ...result };
  }

  @Public()
  @Get()
  async health() {
    const result = await this.healthService.ready();
    if (!result.ready) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        ...result,
      });
    }
    return { status: 'ok', ...result };
  }

  @Get('runtime')
  async runtime(@CurrentPrincipal() principal: Principal) {
    if (!principal.isPlatformAdmin) {
      throw new ForbiddenException(
        'Platform administrator access required.',
      );
    }
    return this.healthService.runtime();
  }
}
