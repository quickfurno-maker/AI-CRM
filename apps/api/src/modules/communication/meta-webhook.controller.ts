import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../platform/auth/public.decorator.js';
import { MetaWebhookService } from './meta-webhook.service.js';

@Controller('webhooks/meta/whatsapp')
export class MetaWebhookController {
  constructor(private readonly webhooks: MetaWebhookService) {}

  @Public()
  @Get()
  @Header('content-type', 'text/plain')
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    return this.webhooks.verifyChallenge(mode, token, challenge);
  }

  @Public()
  @Post()
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() payload: Record<string, unknown>,
  ) {
    if (!request.rawBody) {
      throw new BadRequestException(
        'Raw request body is required for Meta signature verification.',
      );
    }

    await this.webhooks.ingest(
      request.rawBody,
      signature,
      payload,
    );
    return 'EVENT_RECEIVED';
  }
}
