import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ConfirmGatewayPaymentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  providerOrderId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  providerPaymentId: string;

  @IsString()
  @Matches(/^[a-f0-9]{32,128}$/i)
  signature: string;
}

export class RefundGatewayPaymentDto {
  @IsUUID()
  receiptId: string;

  @Matches(/^\d+(?:\.\d{1,2})?$/)
  amount: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotencyKey: string;
}
