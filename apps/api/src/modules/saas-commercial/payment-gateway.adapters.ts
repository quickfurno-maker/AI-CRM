import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';
import {
  BadGatewayException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  CreateGatewayOrderInput,
  CreateGatewayRefundInput,
  GatewayOrder,
  GatewayPayment,
  GatewayRefund,
  PaymentGatewayAdapter,
} from './payment-gateway.types.js';

function safeEqualHex(expected: string, actual: string) {
  if (!/^[a-f0-9]+$/i.test(actual)) return false;
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(actual, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function hmacHex(secret: string, payload: string | Buffer) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export class RazorpayPaymentGatewayAdapter
  implements PaymentGatewayAdapter
{
  readonly provider = 'razorpay' as const;
  readonly publicKeyId: string;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
  ) {
    this.publicKeyId = keyId;
  }

  async createOrder(
    input: CreateGatewayOrderInput,
  ): Promise<GatewayOrder> {
    const body = await this.request<Record<string, unknown>>(
      'POST',
      '/orders',
      {
        amount: input.amountMinor,
        currency: input.currency,
        receipt: input.receipt.slice(0, 40),
        notes: input.notes,
      },
    );
    return {
      id: String(body.id),
      status: String(body.status ?? 'created'),
      amountMinor: Number(body.amount),
      currency: String(body.currency),
      raw: body,
    };
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    const body = await this.request<Record<string, unknown>>(
      'GET',
      '/payments/' + encodeURIComponent(paymentId),
    );
    return {
      id: String(body.id),
      orderId:
        typeof body.order_id === 'string' ? body.order_id : null,
      status: String(body.status ?? 'unknown'),
      captured: body.captured === true,
      amountMinor: Number(body.amount),
      currency: String(body.currency),
      raw: body,
    };
  }

  async refundPayment(
    input: CreateGatewayRefundInput,
  ): Promise<GatewayRefund> {
    const body = await this.request<Record<string, unknown>>(
      'POST',
      '/payments/' +
        encodeURIComponent(input.paymentId) +
        '/refund',
      {
        amount: input.amountMinor,
        receipt: input.receipt.slice(0, 40),
        notes: input.notes,
      },
    );
    return {
      id: String(body.id),
      paymentId: String(body.payment_id ?? input.paymentId),
      status: String(body.status ?? 'pending'),
      amountMinor: Number(body.amount),
      currency:
        typeof body.currency === 'string' ? body.currency : null,
      raw: body,
    };
  }

  verifyWebhook(rawBody: Buffer, signature: string) {
    return safeEqualHex(
      hmacHex(this.webhookSecret, rawBody),
      signature,
    );
  }

  verifyCheckoutSignature(
    orderId: string,
    paymentId: string,
    signature: string,
  ) {
    return safeEqualHex(
      hmacHex(this.keySecret, orderId + '|' + paymentId),
      signature,
    );
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const auth = Buffer.from(
      this.keyId + ':' + this.keySecret,
    ).toString('base64');
    const response = await fetch(
      'https://api.razorpay.com/v1' + path,
      {
        method,
        headers: {
          authorization: 'Basic ' + auth,
          ...(body
            ? { 'content-type': 'application/json' }
            : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1000);
      throw new BadGatewayException(
        'Razorpay request failed (' +
          response.status +
          '): ' +
          detail,
      );
    }
    return (await response.json()) as T;
  }
}

export class TestPaymentGatewayAdapter
  implements PaymentGatewayAdapter
{
  readonly provider = 'test' as const;
  readonly publicKeyId = 'test_payment_key';

  constructor(private readonly secret: string) {}

  async createOrder(
    input: CreateGatewayOrderInput,
  ): Promise<GatewayOrder> {
    return {
      id: 'test_order_' + input.intentId.replaceAll('-', ''),
      status: 'created',
      amountMinor: input.amountMinor,
      currency: input.currency,
      raw: {
        id: 'test_order_' + input.intentId.replaceAll('-', ''),
        status: 'created',
        amount: input.amountMinor,
        currency: input.currency,
        receipt: input.receipt,
        notes: input.notes,
      },
    };
  }

  async fetchPayment(paymentId: string): Promise<GatewayPayment> {
    if (!paymentId.startsWith('test_payment_')) {
      throw new UnauthorizedException('Unknown test payment.');
    }
    const parts = paymentId.split('__');
    if (parts.length !== 4) {
      throw new UnauthorizedException(
        'Malformed deterministic test payment.',
      );
    }
    return {
      id: paymentId,
      orderId: parts[1],
      status: 'captured',
      captured: true,
      amountMinor: Number(parts[2]),
      currency: parts[3],
      raw: {
        id: paymentId,
        order_id: parts[1],
        status: 'captured',
        captured: true,
        amount: Number(parts[2]),
        currency: parts[3],
      },
    };
  }

  async refundPayment(
    input: CreateGatewayRefundInput,
  ): Promise<GatewayRefund> {
    return {
      id:
        'test_refund_' +
        input.receipt.replace(/[^a-z0-9]/gi, '').slice(-24),
      paymentId: input.paymentId,
      status: 'processed',
      amountMinor: input.amountMinor,
      currency: null,
      raw: {
        payment_id: input.paymentId,
        amount: input.amountMinor,
        status: 'processed',
      },
    };
  }

  verifyWebhook(rawBody: Buffer, signature: string) {
    return safeEqualHex(hmacHex(this.secret, rawBody), signature);
  }

  verifyCheckoutSignature(
    orderId: string,
    paymentId: string,
    signature: string,
  ) {
    return safeEqualHex(
      hmacHex(this.secret, orderId + '|' + paymentId),
      signature,
    );
  }
}
