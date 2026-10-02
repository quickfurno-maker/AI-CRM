import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../../platform/auth/public.decorator.js';
import { DatabaseService } from '../../platform/database/database.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Public()
  @Get()
  async health() {
    const database = await this.database.health().catch(() => false);
    if (!database) throw new ServiceUnavailableException('Database unavailable.');
    return {
      status: 'ok',
      database: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
