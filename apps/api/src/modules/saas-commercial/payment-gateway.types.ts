export type PaymentGatewayMode = 'disabled' | 'test' | 'live';
export type PaymentGatewayProvider = 'test' | 'razorpay';

export type CreateGatewayOrderInput = {
  intentId: string;
  amountMinor: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
};

export type GatewayOrder = {
  id: string;
  status: string;
  amountMinor: number;
  currency: string;
  raw: Record<string, unknown>;
};

export type GatewayPayment = {
  id: string;
  orderId: string | null;
  status: string;
  captured: boolean;
  amountMinor: number;
  currency: string;
  raw: Record<string, unknown>;
};

export type CreateGatewayRefundInput = {
  paymentId: string;
  amountMinor: number;
  notes: Record<string, string>;
  receipt: string;
};

export type GatewayRefund = {
  id: string;
  paymentId: string;
  status: string;
  amountMinor: number;
  currency: string | null;
  raw: Record<string, unknown>;
};

export interface PaymentGatewayAdapter {
  readonly provider: PaymentGatewayProvider;
  readonly publicKeyId: string | null;
  createOrder(input: CreateGatewayOrderInput): Promise<GatewayOrder>;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  refundPayment(input: CreateGatewayRefundInput): Promise<GatewayRefund>;
  verifyWebhook(rawBody: Buffer, signature: string): boolean;
  verifyCheckoutSignature(
    orderId: string,
    paymentId: string,
    signature: string,
  ): boolean;
}
