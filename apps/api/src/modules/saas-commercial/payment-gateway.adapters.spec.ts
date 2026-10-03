import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  RazorpayPaymentGatewayAdapter,
  TestPaymentGatewayAdapter,
} from './payment-gateway.adapters.js';

describe('payment gateway adapters', () => {
  it('creates deterministic test orders without external calls', async () => {
    const adapter = new TestPaymentGatewayAdapter('test-secret-123456');
    const order = await adapter.createOrder({
      intentId: '11111111-2222-3333-4444-555555555555',
      amountMinor: 125099,
      currency: 'INR',
      receipt: 'bos-test',
      notes: { checkout_id: 'checkout-1' },
    });

    expect(order.id).toBe(
      'test_order_11111111222233334444555555555555',
    );
    expect(order.amountMinor).toBe(125099);
    expect(order.currency).toBe('INR');
  });

  it('validates webhook HMAC with timing-safe comparison', () => {
    const secret = 'webhook-test-secret-123';
    const adapter = new TestPaymentGatewayAdapter(secret);
    const body = Buffer.from(
      JSON.stringify({ event: 'payment.captured' }),
    );
    const valid = createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    expect(adapter.verifyWebhook(body, valid)).toBe(true);
    expect(adapter.verifyWebhook(body, '00'.repeat(32))).toBe(false);
    expect(adapter.verifyWebhook(body, 'not-hex')).toBe(false);
  });

  it('uses provider checkout signature contract', () => {
    const secret = 'checkout-test-secret-123';
    const adapter = new TestPaymentGatewayAdapter(secret);
    const orderId = 'order_123';
    const paymentId = 'pay_456';
    const signature = createHmac('sha256', secret)
      .update(orderId + '|' + paymentId)
      .digest('hex');

    expect(
      adapter.verifyCheckoutSignature(
        orderId,
        paymentId,
        signature,
      ),
    ).toBe(true);
    expect(
      adapter.verifyCheckoutSignature(
        orderId,
        paymentId,
        '00'.repeat(32),
      ),
    ).toBe(false);
  });

  it('parses deterministic captured test payments', async () => {
    const adapter = new TestPaymentGatewayAdapter('test-secret-123456');
    const payment = await adapter.fetchPayment(
      'test_payment__test_order_abc__49900__INR',
    );

    expect(payment.orderId).toBe('test_order_abc');
    expect(payment.amountMinor).toBe(49900);
    expect(payment.currency).toBe('INR');
    expect(payment.status).toBe('captured');
    expect(payment.captured).toBe(true);
  });

  it('creates deterministic test refunds', async () => {
    const adapter = new TestPaymentGatewayAdapter('test-secret-123456');
    const refund = await adapter.refundPayment({
      paymentId: 'test_payment_1',
      amountMinor: 10000,
      receipt: 'refund_11111111-2222-3333-4444-555555555555',
      notes: { reason: 'test' },
    });

    expect(refund.paymentId).toBe('test_payment_1');
    expect(refund.amountMinor).toBe(10000);
    expect(refund.status).toBe('processed');
  });

  it('uses Razorpay-compatible HMAC verification without network access', () => {
    const keySecret = 'razorpay-key-secret';
    const webhookSecret = 'razorpay-webhook-secret';
    const adapter = new RazorpayPaymentGatewayAdapter(
      'rzp_test_key',
      keySecret,
      webhookSecret,
    );

    const orderId = 'order_A';
    const paymentId = 'pay_B';
    const checkoutSignature = createHmac('sha256', keySecret)
      .update(orderId + '|' + paymentId)
      .digest('hex');
    const rawBody = Buffer.from('{"event":"payment.captured"}');
    const webhookSignature = createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    expect(
      adapter.verifyCheckoutSignature(
        orderId,
        paymentId,
        checkoutSignature,
      ),
    ).toBe(true);
    expect(
      adapter.verifyWebhook(rawBody, webhookSignature),
    ).toBe(true);
  });
});
