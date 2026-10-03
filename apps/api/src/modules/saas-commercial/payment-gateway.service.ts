import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  and,
  desc,
  eq,
} from 'drizzle-orm';
import {
  createHash,
} from 'node:crypto';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import { outboxEvents } from '../../platform/database/schema.js';
import {
  ConfirmGatewayPaymentDto,
  RefundGatewayPaymentDto,
} from './payment-gateway.dto.js';
import {
  RazorpayPaymentGatewayAdapter,
  TestPaymentGatewayAdapter,
} from './payment-gateway.adapters.js';
import type {
  GatewayPayment,
  PaymentGatewayAdapter,
  PaymentGatewayMode,
  PaymentGatewayProvider,
} from './payment-gateway.types.js';
import {
  saasCheckoutSessions,
  saasCustomerBillingProfiles,
  saasDunningCases,
  saasInvoices,
  saasPaymentGatewayEvents,
  saasPaymentIntents,
  saasPaymentRefunds,
  saasReceipts,
} from './saas-commercial.schema.js';
import { SaasCommercialService } from './saas-commercial.service.js';

type PaymentIntent = typeof saasPaymentIntents.$inferSelect;

@Injectable()
export class PaymentGatewayService {
  constructor(
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
    private readonly commercial: SaasCommercialService,
  ) {}

  status() {
    const mode = this.mode();
    const provider = this.provider();
    const adapter = mode === 'disabled' ? undefined : this.adapter();
    return {
      mode,
      provider,
      enabled: mode !== 'disabled',
      activationPending: mode === 'disabled',
      publicKeyId: adapter?.publicKeyId ?? null,
      clientIntegration:
        provider === 'razorpay' ? 'RAZORPAY_CHECKOUT' : 'TEST',
      webhookPath:
        '/v1/saas/payment-webhooks/' + provider,
      capabilities: {
        oneTimeCheckout: mode !== 'disabled',
        invoiceRecovery: mode !== 'disabled',
        signedWebhooks: mode !== 'disabled',
        refunds: mode !== 'disabled',
        recurringMandates: false,
      },
    };
  }

  async createCheckoutIntent(
    principal: Principal,
    checkoutId: string,
  ) {
    const rows = await this.database.db
      .select()
      .from(saasCheckoutSessions)
      .where(
        and(
          eq(saasCheckoutSessions.id, checkoutId),
          eq(
            saasCheckoutSessions.organizationId,
            principal.organizationId,
          ),
        ),
      )
      .limit(1);
    const checkout = rows[0];
    if (!checkout) throw new NotFoundException('Checkout not found.');
    if (checkout.status === 'COMPLETED') {
      return {
        status: 'COMPLETED',
        checkout,
        gateway: this.status(),
      };
    }
    if (checkout.status !== 'OPEN') {
      throw new ConflictException(
        'Only open checkout sessions can create a payment intent.',
      );
    }
    if (checkout.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException('Checkout session has expired.');
    }
    if (this.mode() === 'disabled') {
      return {
        status: 'EXTERNAL_ACTIVATION_PENDING',
        checkoutId: checkout.id,
        gateway: this.status(),
      };
    }

    return this.ensureIntent({
      organizationId: checkout.organizationId,
      checkoutSessionId: checkout.id,
      invoiceId: null,
      dunningCaseId: null,
      purpose: 'CHECKOUT',
      amount: checkout.total,
      currency: checkout.currency,
      idempotencyKey: 'checkout:' + checkout.id,
      description:
        checkout.checkoutType === 'PLAN'
          ? 'Business OS subscription'
          : 'Business OS add-on',
    });
  }

  async createInvoiceIntent(
    principal: Principal,
    invoiceId: string,
  ) {
    const rows = await this.database.db
      .select()
      .from(saasInvoices)
      .where(
        and(
          eq(saasInvoices.id, invoiceId),
          eq(
            saasInvoices.organizationId,
            principal.organizationId,
          ),
        ),
      )
      .limit(1);
    const invoice = rows[0];
    if (!invoice) throw new NotFoundException('SaaS invoice not found.');
    if (!['OPEN', 'PAST_DUE'].includes(invoice.status)) {
      throw new ConflictException(
        'Only open or past-due invoices can be paid.',
      );
    }
    if (Number(invoice.balanceDue) <= 0) {
      throw new ConflictException('Invoice has no balance due.');
    }
    if (this.mode() === 'disabled') {
      return {
        status: 'EXTERNAL_ACTIVATION_PENDING',
        invoiceId: invoice.id,
        gateway: this.status(),
      };
    }

    const dunning = await this.database.db
      .select()
      .from(saasDunningCases)
      .where(eq(saasDunningCases.invoiceId, invoice.id))
      .limit(1);

    return this.ensureIntent({
      organizationId: invoice.organizationId,
      checkoutSessionId: null,
      invoiceId: invoice.id,
      dunningCaseId: dunning[0]?.id ?? null,
      purpose: 'INVOICE',
      amount: invoice.balanceDue,
      currency: invoice.currency,
      idempotencyKey:
        'invoice:' + invoice.id + ':' + invoice.balanceDue,
      description: 'Business OS invoice ' + invoice.invoiceNumber,
    });
  }

  async confirmCheckout(
    principal: Principal,
    checkoutId: string,
    dto: ConfirmGatewayPaymentDto,
  ) {
    const intentRows = await this.database.db
      .select()
      .from(saasPaymentIntents)
      .where(
        and(
          eq(saasPaymentIntents.checkoutSessionId, checkoutId),
          eq(
            saasPaymentIntents.organizationId,
            principal.organizationId,
          ),
        ),
      )
      .orderBy(desc(saasPaymentIntents.createdAt))
      .limit(1);
    const intent = intentRows[0];
    if (!intent) {
      throw new NotFoundException('Payment intent not found.');
    }
    if (intent.providerOrderId !== dto.providerOrderId) {
      throw new BadRequestException(
        'Provider order does not match checkout intent.',
      );
    }
    const adapter = this.adapterFor(intent.provider);
    if (
      !adapter.verifyCheckoutSignature(
        dto.providerOrderId,
        dto.providerPaymentId,
        dto.signature,
      )
    ) {
      throw new UnauthorizedException(
        'Payment confirmation signature is invalid.',
      );
    }
    const payment = await adapter.fetchPayment(
      dto.providerPaymentId,
    );
    return this.settleIntent(intent, payment);
  }

  async handleWebhook(
    providerInput: string,
    rawBody: Buffer,
    signature: string | undefined,
    providerEventId?: string,
  ) {
    const provider = this.parseProvider(providerInput);
    const adapter = this.adapterFor(provider);
    if (!signature) {
      throw new UnauthorizedException(
        'Payment webhook signature is required.',
      );
    }
    if (!adapter.verifyWebhook(rawBody, signature)) {
      throw new UnauthorizedException(
        'Payment webhook signature is invalid.',
      );
    }

    const payload = JSON.parse(
      rawBody.toString('utf8'),
    ) as Record<string, unknown>;
    const eventType =
      typeof payload.event === 'string'
        ? payload.event
        : 'unknown';
    const eventId =
      providerEventId?.slice(0, 240) ||
      createHash('sha256').update(rawBody).digest('hex');

    const inserted = await this.database.db
      .insert(saasPaymentGatewayEvents)
      .values({
        provider,
        providerEventId: eventId,
        eventType,
        signatureValid: true,
        status: 'RECEIVED',
        payload,
      })
      .onConflictDoNothing()
      .returning();

    let gatewayEvent = inserted[0];
    if (!gatewayEvent) {
      const rows = await this.database.db
        .select()
        .from(saasPaymentGatewayEvents)
        .where(
          and(
            eq(saasPaymentGatewayEvents.provider, provider),
            eq(
              saasPaymentGatewayEvents.providerEventId,
              eventId,
            ),
          ),
        )
        .limit(1);
      gatewayEvent = rows[0];
      if (gatewayEvent?.status === 'PROCESSED') {
        return {
          accepted: true,
          duplicate: true,
          eventType,
        };
      }
    }

    try {
      const result = await this.processProviderEvent(
        provider,
        eventType,
        payload,
      );
      await this.database.db
        .update(saasPaymentGatewayEvents)
        .set({
          status: 'PROCESSED',
          providerOrderId: result.providerOrderId,
          providerPaymentId: result.providerPaymentId,
          processedAt: new Date(),
          error: null,
        })
        .where(eq(saasPaymentGatewayEvents.id, gatewayEvent.id));
      return {
        accepted: true,
        duplicate: false,
        eventType,
        result: result.result,
      };
    } catch (error) {
      await this.database.db
        .update(saasPaymentGatewayEvents)
        .set({
          status: 'FAILED',
          error:
            error instanceof Error
              ? error.message.slice(0, 4000)
              : String(error).slice(0, 4000),
        })
        .where(eq(saasPaymentGatewayEvents.id, gatewayEvent.id));
      throw error;
    }
  }

  async requestRefund(
    principal: Principal,
    dto: RefundGatewayPaymentDto,
  ) {
    if (!principal.isPlatformAdmin) {
      throw new ForbiddenException(
        'Payment refunds require platform admin.',
      );
    }
    if (this.mode() === 'disabled') {
      throw new ServiceUnavailableException(
        'Payment gateway is not activated.',
      );
    }
    const receiptRows = await this.database.db
      .select()
      .from(saasReceipts)
      .where(eq(saasReceipts.id, dto.receiptId))
      .limit(1);
    const receipt = receiptRows[0];
    if (!receipt) throw new NotFoundException('Receipt not found.');
    if (!receipt.provider || !receipt.providerPaymentId) {
      throw new ConflictException(
        'Receipt is not linked to a provider payment.',
      );
    }
    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        'Refund amount must be positive.',
      );
    }
    const existing = await this.database.db
      .select()
      .from(saasPaymentRefunds)
      .where(eq(saasPaymentRefunds.receiptId, receipt.id));
    const reserved = existing
      .filter((row) =>
        ['PENDING', 'PROCESSED'].includes(row.status),
      )
      .reduce((sum, row) => sum + Number(row.amount), 0);
    if (amount > Number(receipt.amount) - reserved + 0.0001) {
      throw new ConflictException(
        'Refund amount exceeds refundable receipt balance.',
      );
    }

    const duplicate = existing.find(
      (row) => row.idempotencyKey === dto.idempotencyKey,
    );
    if (duplicate) return duplicate;

    const provider = this.parseProvider(receipt.provider);
    const adapter = this.adapterFor(provider);
    const [refund] = await this.database.db
      .insert(saasPaymentRefunds)
      .values({
        organizationId: receipt.organizationId,
        invoiceId: receipt.invoiceId,
        receiptId: receipt.id,
        provider,
        providerPaymentId: receipt.providerPaymentId,
        amount: String(amount),
        currency: receipt.currency,
        status: 'CREATING',
        reason: dto.reason,
        idempotencyKey: dto.idempotencyKey,
      })
      .returning();

    try {
      const providerRefund = await adapter.refundPayment({
        paymentId: receipt.providerPaymentId,
        amountMinor: this.toMinor(amount),
        receipt: 'refund_' + refund.id,
        notes: {
          refund_id: refund.id,
          invoice_id: receipt.invoiceId,
          organization_id: receipt.organizationId,
        },
      });
      const [updated] = await this.database.db
        .update(saasPaymentRefunds)
        .set({
          providerRefundId: providerRefund.id,
          status:
            providerRefund.status === 'processed'
              ? 'PROCESSED'
              : 'PENDING',
          completedAt:
            providerRefund.status === 'processed'
              ? new Date()
              : null,
          metadata: { provider: providerRefund.raw },
          updatedAt: new Date(),
        })
        .where(eq(saasPaymentRefunds.id, refund.id))
        .returning();

      await this.database.db.insert(outboxEvents).values({
        organizationId: receipt.organizationId,
        eventType: 'saas.payment.refund_requested.v1',
        aggregateType: 'saas_payment_refund',
        aggregateId: refund.id,
        payload: {
          refundId: refund.id,
          invoiceId: receipt.invoiceId,
          receiptId: receipt.id,
          provider,
          providerRefundId: providerRefund.id,
          amount: dto.amount,
          currency: receipt.currency,
        },
      });
      return updated;
    } catch (error) {
      await this.database.db
        .update(saasPaymentRefunds)
        .set({
          status: 'FAILED',
          metadata: {
            error:
              error instanceof Error
                ? error.message
                : String(error),
          },
          updatedAt: new Date(),
        })
        .where(eq(saasPaymentRefunds.id, refund.id));
      throw error;
    }
  }

  async adminSummary(principal: Principal) {
    if (!principal.isPlatformAdmin) {
      throw new ForbiddenException(
        'Payment gateway operations require platform admin.',
      );
    }
    const [intents, events, refunds] = await Promise.all([
      this.database.db
        .select()
        .from(saasPaymentIntents)
        .orderBy(desc(saasPaymentIntents.createdAt))
        .limit(100),
      this.database.db
        .select()
        .from(saasPaymentGatewayEvents)
        .orderBy(desc(saasPaymentGatewayEvents.receivedAt))
        .limit(100),
      this.database.db
        .select()
        .from(saasPaymentRefunds)
        .orderBy(desc(saasPaymentRefunds.createdAt))
        .limit(100),
    ]);
    return {
      gateway: this.status(),
      intents,
      events,
      refunds,
    };
  }

  private async ensureIntent(input: {
    organizationId: string;
    checkoutSessionId: string | null;
    invoiceId: string | null;
    dunningCaseId: string | null;
    purpose: 'CHECKOUT' | 'INVOICE';
    amount: string;
    currency: string;
    idempotencyKey: string;
    description: string;
  }) {
    this.assertCurrency(input.currency);
    const provider = this.provider();
    const existing = await this.database.db
      .select()
      .from(saasPaymentIntents)
      .where(
        and(
          eq(saasPaymentIntents.provider, provider),
          eq(
            saasPaymentIntents.idempotencyKey,
            input.idempotencyKey,
          ),
        ),
      )
      .limit(1);
    if (existing[0]) {
      return this.intentResponse(existing[0], input.description);
    }

    const [intent] = await this.database.db
      .insert(saasPaymentIntents)
      .values({
        organizationId: input.organizationId,
        checkoutSessionId: input.checkoutSessionId,
        invoiceId: input.invoiceId,
        dunningCaseId: input.dunningCaseId,
        provider,
        purpose: input.purpose,
        amount: input.amount,
        currency: input.currency,
        status: 'CREATING',
        idempotencyKey: input.idempotencyKey,
      })
      .returning();

    const adapter = this.adapterFor(provider);
    try {
      const order = await adapter.createOrder({
        intentId: intent.id,
        amountMinor: this.toMinor(Number(input.amount)),
        currency: input.currency,
        receipt: 'bos_' + intent.id,
        notes: {
          payment_intent_id: intent.id,
          organization_id: input.organizationId,
          ...(input.checkoutSessionId
            ? { checkout_id: input.checkoutSessionId }
            : {}),
          ...(input.invoiceId
            ? { invoice_id: input.invoiceId }
            : {}),
        },
      });
      const [updated] = await this.database.db
        .update(saasPaymentIntents)
        .set({
          status: 'PENDING',
          providerOrderId: order.id,
          metadata: {
            description: input.description,
            providerOrder: order.raw,
          },
          updatedAt: new Date(),
        })
        .where(eq(saasPaymentIntents.id, intent.id))
        .returning();

      if (input.checkoutSessionId) {
        const checkoutRows = await this.database.db
          .select()
          .from(saasCheckoutSessions)
          .where(
            eq(
              saasCheckoutSessions.id,
              input.checkoutSessionId,
            ),
          )
          .limit(1);
        const checkout = checkoutRows[0];
        if (checkout) {
          await this.database.db
            .update(saasCheckoutSessions)
            .set({
              provider,
              providerSessionId: order.id,
              metadata: {
                ...(checkout.metadata ?? {}),
                paymentProviderStatus: 'PENDING',
                paymentIntentId: intent.id,
              },
              updatedAt: new Date(),
            })
            .where(
              eq(
                saasCheckoutSessions.id,
                input.checkoutSessionId,
              ),
            );
        }
      }

      await this.database.db.insert(outboxEvents).values({
        organizationId: input.organizationId,
        eventType: 'saas.payment.intent.created.v1',
        aggregateType: 'saas_payment_intent',
        aggregateId: intent.id,
        payload: {
          paymentIntentId: intent.id,
          provider,
          providerOrderId: order.id,
          purpose: input.purpose,
          checkoutSessionId: input.checkoutSessionId,
          invoiceId: input.invoiceId,
          amount: input.amount,
          currency: input.currency,
        },
      });

      return this.intentResponse(updated, input.description);
    } catch (error) {
      await this.database.db
        .update(saasPaymentIntents)
        .set({
          status: 'FAILED',
          failureReason:
            error instanceof Error
              ? error.message.slice(0, 4000)
              : String(error).slice(0, 4000),
          updatedAt: new Date(),
        })
        .where(eq(saasPaymentIntents.id, intent.id));
      throw error;
    }
  }

  private intentResponse(
    intent: PaymentIntent,
    description: string,
  ) {
    const adapter = this.adapterFor(
      this.parseProvider(intent.provider),
    );
    return {
      status: intent.status,
      intent: {
        id: intent.id,
        provider: intent.provider,
        providerOrderId: intent.providerOrderId,
        amount: intent.amount,
        currency: intent.currency,
        purpose: intent.purpose,
      },
      client: intent.providerOrderId
        ? {
            type:
              intent.provider === 'razorpay'
                ? 'RAZORPAY_CHECKOUT'
                : 'TEST',
            keyId: adapter.publicKeyId,
            orderId: intent.providerOrderId,
            amountMinor: this.toMinor(Number(intent.amount)),
            currency: intent.currency,
            name: 'Business OS',
            description,
          }
        : null,
      gateway: this.status(),
    };
  }

  private async processProviderEvent(
    provider: PaymentGatewayProvider,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    const payment = this.paymentEntity(payload);
    const refund = this.refundEntity(payload);

    if (
      ['payment.captured', 'order.paid'].includes(eventType) &&
      payment
    ) {
      const providerOrderId =
        typeof payment.order_id === 'string'
          ? payment.order_id
          : null;
      if (!providerOrderId) {
        return {
          providerOrderId: null,
          providerPaymentId: String(payment.id ?? ''),
          result: 'IGNORED_NO_ORDER',
        };
      }
      const intent = await this.intentByOrder(
        provider,
        providerOrderId,
      );
      if (!intent) {
        return {
          providerOrderId,
          providerPaymentId: String(payment.id ?? ''),
          result: 'IGNORED_UNKNOWN_ORDER',
        };
      }
      const verified =
        this.mode() === 'test'
          ? this.paymentFromEntity(payment)
          : await this.adapterFor(provider).fetchPayment(
              String(payment.id),
            );
      await this.settleIntent(intent, verified);
      return {
        providerOrderId,
        providerPaymentId: verified.id,
        result: 'PAYMENT_RECONCILED',
      };
    }

    if (eventType === 'payment.failed' && payment) {
      const providerOrderId =
        typeof payment.order_id === 'string'
          ? payment.order_id
          : null;
      const intent = providerOrderId
        ? await this.intentByOrder(provider, providerOrderId)
        : undefined;
      if (intent) {
        await this.database.db
          .update(saasPaymentIntents)
          .set({
            status: 'PENDING',
            failureCode:
              typeof payment.error_code === 'string'
                ? payment.error_code
                : null,
            failureReason:
              typeof payment.error_description === 'string'
                ? payment.error_description
                : 'Provider payment attempt failed.',
            metadata: {
              ...(intent.metadata ?? {}),
              lastFailedPaymentId: payment.id,
            },
            updatedAt: new Date(),
          })
          .where(eq(saasPaymentIntents.id, intent.id));
        await this.database.db.insert(outboxEvents).values({
          organizationId: intent.organizationId,
          eventType: 'saas.payment.attempt_failed.v1',
          aggregateType: 'saas_payment_intent',
          aggregateId: intent.id,
          payload: {
            paymentIntentId: intent.id,
            provider,
            providerOrderId,
            providerPaymentId: payment.id,
            reason: payment.error_description,
          },
        });
      }
      return {
        providerOrderId,
        providerPaymentId:
          typeof payment.id === 'string' ? payment.id : null,
        result: intent
          ? 'PAYMENT_FAILURE_RECORDED'
          : 'IGNORED_UNKNOWN_ORDER',
      };
    }

    if (
      ['refund.processed', 'refund.failed'].includes(eventType) &&
      refund
    ) {
      const providerRefundId =
        typeof refund.id === 'string' ? refund.id : null;
      if (!providerRefundId) {
        return {
          providerOrderId: null,
          providerPaymentId: null,
          result: 'IGNORED_MALFORMED_REFUND',
        };
      }
      const rows = await this.database.db
        .select()
        .from(saasPaymentRefunds)
        .where(
          and(
            eq(saasPaymentRefunds.provider, provider),
            eq(
              saasPaymentRefunds.providerRefundId,
              providerRefundId,
            ),
          ),
        )
        .limit(1);
      const stored = rows[0];
      if (!stored) {
        return {
          providerOrderId: null,
          providerPaymentId:
            typeof refund.payment_id === 'string'
              ? refund.payment_id
              : null,
          result: 'IGNORED_UNKNOWN_REFUND',
        };
      }
      const processed = eventType === 'refund.processed';
      await this.database.db
        .update(saasPaymentRefunds)
        .set({
          status: processed ? 'PROCESSED' : 'FAILED',
          completedAt: processed ? new Date() : null,
          metadata: {
            ...(stored.metadata ?? {}),
            webhook: refund,
          },
          updatedAt: new Date(),
        })
        .where(eq(saasPaymentRefunds.id, stored.id));
      await this.database.db.insert(outboxEvents).values({
        organizationId: stored.organizationId,
        eventType: processed
          ? 'saas.payment.refund_processed.v1'
          : 'saas.payment.refund_failed.v1',
        aggregateType: 'saas_payment_refund',
        aggregateId: stored.id,
        payload: {
          refundId: stored.id,
          providerRefundId,
          providerPaymentId: stored.providerPaymentId,
          amount: stored.amount,
          currency: stored.currency,
        },
      });
      return {
        providerOrderId: null,
        providerPaymentId: stored.providerPaymentId,
        result: processed
          ? 'REFUND_RECONCILED'
          : 'REFUND_FAILURE_RECORDED',
      };
    }

    return {
      providerOrderId: null,
      providerPaymentId: null,
      result: 'IGNORED_EVENT',
    };
  }

  private async settleIntent(
    intent: PaymentIntent,
    payment: GatewayPayment,
  ) {
    if (intent.status === 'PAID') {
      return { paymentIntent: intent, idempotent: true };
    }
    this.assertPaymentMatches(intent, payment);

    const [paidIntent] = await this.database.db
      .update(saasPaymentIntents)
      .set({
        status: 'PAID',
        providerPaymentId: payment.id,
        failureCode: null,
        failureReason: null,
        completedAt: new Date(),
        metadata: {
          ...(intent.metadata ?? {}),
          verifiedPayment: payment.raw,
        },
        updatedAt: new Date(),
      })
      .where(eq(saasPaymentIntents.id, intent.id))
      .returning();

    let commercialResult: unknown;
    if (intent.checkoutSessionId) {
      commercialResult =
        await this.commercial.completeCheckoutTrusted(
          intent.checkoutSessionId,
          {
            provider: intent.provider,
            providerPaymentId: payment.id,
            providerSessionId:
              intent.providerOrderId ?? undefined,
          },
        );
    } else if (intent.invoiceId) {
      commercialResult =
        await this.commercial.reconcileInvoicePaymentTrusted(
          intent.invoiceId,
          {
            provider: intent.provider,
            providerPaymentId: payment.id,
            providerAttemptId:
              intent.providerOrderId ?? undefined,
          },
        );
    } else {
      throw new ConflictException(
        'Payment intent has no settlement target.',
      );
    }

    await this.database.db.insert(outboxEvents).values({
      organizationId: intent.organizationId,
      eventType: 'saas.payment.settled.v1',
      aggregateType: 'saas_payment_intent',
      aggregateId: intent.id,
      payload: {
        paymentIntentId: intent.id,
        provider: intent.provider,
        providerOrderId: intent.providerOrderId,
        providerPaymentId: payment.id,
        checkoutSessionId: intent.checkoutSessionId,
        invoiceId: intent.invoiceId,
        amount: intent.amount,
        currency: intent.currency,
      },
    });

    return {
      paymentIntent: paidIntent,
      commercialResult,
      idempotent: false,
    };
  }

  private assertPaymentMatches(
    intent: PaymentIntent,
    payment: GatewayPayment,
  ) {
    if (!payment.captured || payment.status !== 'captured') {
      throw new ConflictException(
        'Provider payment is not captured.',
      );
    }
    if (
      intent.providerOrderId &&
      payment.orderId !== intent.providerOrderId
    ) {
      throw new ConflictException(
        'Provider payment order does not match intent.',
      );
    }
    if (payment.currency !== intent.currency) {
      throw new ConflictException(
        'Provider payment currency does not match intent.',
      );
    }
    if (
      payment.amountMinor !==
      this.toMinor(Number(intent.amount))
    ) {
      throw new ConflictException(
        'Provider payment amount does not match intent.',
      );
    }
  }

  private async intentByOrder(
    provider: PaymentGatewayProvider,
    providerOrderId: string,
  ) {
    const rows = await this.database.db
      .select()
      .from(saasPaymentIntents)
      .where(
        and(
          eq(saasPaymentIntents.provider, provider),
          eq(
            saasPaymentIntents.providerOrderId,
            providerOrderId,
          ),
        ),
      )
      .limit(1);
    return rows[0];
  }

  private paymentFromEntity(
    entity: Record<string, unknown>,
  ): GatewayPayment {
    return {
      id: String(entity.id),
      orderId:
        typeof entity.order_id === 'string'
          ? entity.order_id
          : null,
      status: String(entity.status),
      captured: entity.captured === true,
      amountMinor: Number(entity.amount),
      currency: String(entity.currency),
      raw: entity,
    };
  }

  private paymentEntity(payload: Record<string, unknown>) {
    const root = payload.payload;
    if (!root || typeof root !== 'object') return undefined;
    const payment = (root as Record<string, unknown>).payment;
    if (!payment || typeof payment !== 'object') return undefined;
    const entity = (payment as Record<string, unknown>).entity;
    return entity && typeof entity === 'object'
      ? (entity as Record<string, unknown>)
      : undefined;
  }

  private refundEntity(payload: Record<string, unknown>) {
    const root = payload.payload;
    if (!root || typeof root !== 'object') return undefined;
    const refund = (root as Record<string, unknown>).refund;
    if (!refund || typeof refund !== 'object') return undefined;
    const entity = (refund as Record<string, unknown>).entity;
    return entity && typeof entity === 'object'
      ? (entity as Record<string, unknown>)
      : undefined;
  }

  private adapter() {
    return this.adapterFor(this.provider());
  }

  private adapterFor(provider: string): PaymentGatewayAdapter {
    const parsed = this.parseProvider(provider);
    if (parsed === 'test') {
      return new TestPaymentGatewayAdapter(
        this.config.get<string>(
          'SAAS_PAYMENT_TEST_SECRET',
          'dev-payment-test-secret-change-before-production',
        ),
      );
    }
    return new RazorpayPaymentGatewayAdapter(
      this.config.getOrThrow<string>('RAZORPAY_KEY_ID'),
      this.config.getOrThrow<string>('RAZORPAY_KEY_SECRET'),
      this.config.getOrThrow<string>(
        'RAZORPAY_WEBHOOK_SECRET',
      ),
    );
  }

  private mode(): PaymentGatewayMode {
    return this.config.get<PaymentGatewayMode>(
      'SAAS_PAYMENT_MODE',
      'disabled',
    );
  }

  private provider(): PaymentGatewayProvider {
    return this.config.get<PaymentGatewayProvider>(
      'SAAS_PAYMENT_PROVIDER',
      this.mode() === 'test' ? 'test' : 'razorpay',
    );
  }

  private parseProvider(value: string): PaymentGatewayProvider {
    if (value === 'razorpay' || value === 'test') return value;
    throw new BadRequestException(
      'Unsupported payment gateway provider.',
    );
  }

  private assertCurrency(currency: string) {
    const allowed = new Set(
      this.config
        .get<string>('SAAS_PAYMENT_ALLOWED_CURRENCIES', 'INR')
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    );
    if (!allowed.has(currency.toUpperCase())) {
      throw new ConflictException(
        'Currency is not enabled for the payment gateway.',
      );
    }
  }

  private toMinor(amount: number) {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('Invalid payment amount.');
    }
    return Math.round(amount * 100);
  }
}
