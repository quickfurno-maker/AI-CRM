import {
  Body,
  Controller,
  Headers,
  Ip,
  Post,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CurrentPrincipal } from './current-principal.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { Public } from './public.decorator.js';
import { AuthService } from './auth.service.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import type { Principal } from './auth.types.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @RateLimit({ limit: 5, windowSeconds: 60, scope: 'IP' })
  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.auth.register(dto, {
      ipAddress,
      userAgent,
      requestId: requestId ?? randomUUID(),
    });
  }

  @Public()
  @RateLimit({ limit: 10, windowSeconds: 60, scope: 'IP' })
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.auth.login(dto, {
      ipAddress,
      userAgent,
      requestId: requestId ?? randomUUID(),
    });
  }

  @Public()
  @RateLimit({ limit: 30, windowSeconds: 60, scope: 'IP' })
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto);
  }

  @Post('logout')
  logout(@CurrentPrincipal() principal: Principal) {
    return this.auth.logout(principal);
  }
}
