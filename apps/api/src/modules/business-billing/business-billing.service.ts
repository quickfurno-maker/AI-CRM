import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import {
  auditLogs,
  organizations,
  outboxEvents,
  workspaces,
} from '../../platform/database/schema.js';
import { companies, contacts, deals } from '../crm/crm.schema.js';
import type {
  BillingListQueryDto,
  CreateCreditNoteDto,
  CreateInvoiceDto,
  CreatePaymentDto,
  CreateQuoteDto,
  CreateTaxRateDto,
  DocumentItemDto,
  QuoteDecisionDto,
  UpdateInvoiceDto,
  UpdateQuoteDto,
  UpsertBillingSettingsDto,
} from './dto/business-billing.dto.js';
import {
  businessBillingSettings,
  businessCreditNotes,
  businessDocumentSequences,
  businessInvoiceItems,
  businessInvoices,
  businessPayments,
  businessQuoteItems,
  businessQuotes,
  businessTaxRates,
} from './business-billing.schema.js';

type Tx = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];

@Injectable()
export class BusinessBillingService {
  constructor(private readonly database: DatabaseService) {}

  async dashboard(principal: Principal, workspaceId?: string) {
    const workspace = await this.resolveWorkspace(principal, workspaceId);
    await this.refreshOverdue(principal.organizationId, workspace.id);
    const invoices = await this.database.db
      .select()
      .from(businessInvoices)
      .where(
        and(
          eq(businessInvoices.organizationId, principal.organizationId),
          eq(businessInvoices.workspaceId, workspace.id),
        ),
      );
    const payments = await this.database.db
      .select()
      .from(businessPayments)
      .where(
        and(
          eq(businessPayments.organizationId, principal.organizationId),
          eq(businessPayments.workspaceId, workspace.id),
          eq(businessPayments.status, 'POSTED'),
        ),
      );
    return {
      currency:
        invoices[0]?.currency ??
        (await this.ensureSettings(principal, workspace.id)).currency,
      invoiced: money(
        invoices
          .filter((row) => row.status !== 'DRAFT' && row.status !== 'VOID')
          .reduce((sum, row) => sum + cents(row.total), 0),
      ),
      collected: money(
        payments.reduce((sum, row) => sum + cents(row.amount), 0),
      ),
      outstanding: money(
        invoices
          .filter((row) => !['DRAFT', 'VOID', 'PAID', 'CREDITED'].includes(row.status))
          .reduce((sum, row) => sum + cents(row.balanceDue), 0),
      ),
      overdue: money(
        invoices
          .filter((row) => row.status === 'OVERDUE')
          .reduce((sum, row) => sum + cents(row.balanceDue), 0),
      ),
      invoiceCount: invoices.filter((row) => row.status !== 'DRAFT').length,
    };
  }

  async getSettings(principal: Principal, workspaceId?: string) {
    const workspace = await this.resolveWorkspace(principal, workspaceId);
    return this.ensureSettings(principal, workspace.id);
  }

  async upsertSettings(principal: Principal, dto: UpsertBillingSettingsDto) {
    const workspace = await this.resolveWorkspace(principal, dto.workspaceId);
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(businessBillingSettings)
        .values({
          organizationId: principal.organizationId,
          workspaceId: workspace.id,
          legalName: dto.legalName.trim(),
          taxId: dto.taxId?.trim(),
          billingEmail: dto.billingEmail?.trim(),
          billingPhone: dto.billingPhone?.trim(),
          addressLine1: dto.addressLine1?.trim(),
          addressLine2: dto.addressLine2?.trim(),
          city: dto.city?.trim(),
          state: dto.state?.trim(),
          postalCode: dto.postalCode?.trim(),
          country: dto.country ?? 'IN',
          currency: dto.currency ?? 'INR',
          quotePrefix: cleanPrefix(dto.quotePrefix ?? 'Q'),
          invoicePrefix: cleanPrefix(dto.invoicePrefix ?? 'INV'),
          creditNotePrefix: cleanPrefix(dto.creditNotePrefix ?? 'CN'),
          receiptPrefix: cleanPrefix(dto.receiptPrefix ?? 'RCT'),
          defaultPaymentTermsDays: dto.defaultPaymentTermsDays ?? 15,
          notes: dto.notes?.trim(),
        })
        .onConflictDoUpdate({
          target: [
            businessBillingSettings.organizationId,
            businessBillingSettings.workspaceId,
          ],
          set: {
            legalName: dto.legalName.trim(),
            taxId: dto.taxId?.trim(),
            billingEmail: dto.billingEmail?.trim(),
            billingPhone: dto.billingPhone?.trim(),
            addressLine1: dto.addressLine1?.trim(),
            addressLine2: dto.addressLine2?.trim(),
            city: dto.city?.trim(),
            state: dto.state?.trim(),
            postalCode: dto.postalCode?.trim(),
            country: dto.country ?? 'IN',
            currency: dto.currency ?? 'INR',
            quotePrefix: cleanPrefix(dto.quotePrefix ?? 'Q'),
            invoicePrefix: cleanPrefix(dto.invoicePrefix ?? 'INV'),
            creditNotePrefix: cleanPrefix(dto.creditNotePrefix ?? 'CN'),
            receiptPrefix: cleanPrefix(dto.receiptPrefix ?? 'RCT'),
            defaultPaymentTermsDays: dto.defaultPaymentTermsDays ?? 15,
            notes: dto.notes?.trim(),
            updatedAt: new Date(),
          },
        })
        .returning();
      await this.audit(
        tx,
        principal,
        workspace.id,
        'business_billing.settings.upsert',
        'business_billing_settings',
        row.id,
        row,
      );
      return row;
    });
  }

  async listTaxRates(principal: Principal, workspaceId?: string) {
    const workspace = await this.resolveWorkspace(principal, workspaceId);
    return this.database.db
      .select()
      .from(businessTaxRates)
      .where(
        and(
          eq(businessTaxRates.organizationId, principal.organizationId),
          eq(businessTaxRates.workspaceId, workspace.id),
          eq(businessTaxRates.isActive, true),
        ),
      )
      .orderBy(businessTaxRates.name);
  }

  async createTaxRate(principal: Principal, dto: CreateTaxRateDto) {
    const workspace = await this.resolveWorkspace(principal, dto.workspaceId);
    const rate = Number(dto.ratePercent);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw new BadRequestException('Tax rate must be between 0 and 100.');
    }
    const [row] = await this.database.db
      .insert(businessTaxRates)
      .values({
        organizationId: principal.organizationId,
        workspaceId: workspace.id,
        name: dto.name.trim(),
        ratePercent: dto.ratePercent,
        taxCode: dto.taxCode?.trim(),
      })
      .returning();
    return row;
  }

  async listQuotes(principal: Principal, query: BillingListQueryDto) {
    const rows = await this.database.db
      .select()
      .from(businessQuotes)
      .where(eq(businessQuotes.organizationId, principal.organizationId))
      .orderBy(desc(businessQuotes.createdAt))
      .limit(query.limit);
    return rows.filter(
      (row) =>
        (!query.workspaceId || row.workspaceId === query.workspaceId) &&
        (!query.status || row.status === query.status) &&
        (!query.contactId || row.contactId === query.contactId) &&
        (!query.companyId || row.companyId === query.companyId) &&
        (!query.dealId || row.dealId === query.dealId),
    );
  }

  async getQuote(principal: Principal, id: string) {
    const quote = await this.requireQuote(principal, id);
    const items = await this.database.db
      .select()
      .from(businessQuoteItems)
      .where(
        and(
          eq(businessQuoteItems.organizationId, principal.organizationId),
          eq(businessQuoteItems.quoteId, id),
        ),
      )
      .orderBy(businessQuoteItems.position);
    return { quote, items };
  }

  async createQuote(principal: Principal, dto: CreateQuoteDto) {
    if (!dto.contactId && !dto.companyId) {
      throw new BadRequestException('Quote requires a CRM contact or company.');
    }
    const workspace = await this.resolveWorkspace(principal, dto.workspaceId);
    await this.validateCustomerRefs(principal, dto.contactId, dto.companyId, dto.dealId);
    const settings = await this.ensureSettings(principal, workspace.id);
    const calculated = calculateItems(dto.items);
    if (!calculated.items.length) {
      throw new BadRequestException('Quote requires at least one item.');
    }

    return this.database.db.transaction(async (tx) => {
      const [quote] = await tx
        .insert(businessQuotes)
        .values({
          organizationId: principal.organizationId,
          workspaceId: workspace.id,
          contactId: dto.contactId,
          companyId: dto.companyId,
          dealId: dto.dealId,
          ownerMemberId: principal.membershipId,
          currency: dto.currency ?? settings.currency,
          subtotal: calculated.subtotal,
          discountAmount: calculated.discountAmount,
          taxAmount: calculated.taxAmount,
          total: calculated.total,
          validUntil: dto.validUntil,
          notes: dto.notes?.trim(),
        })
        .returning();
      await tx.insert(businessQuoteItems).values(
        calculated.items.map((item, position) => ({
          organizationId: principal.organizationId,
          quoteId: quote.id,
          position,
          ...item,
        })),
      );
      await this.audit(tx, principal, workspace.id, 'business_billing.quote.create', 'business_quote', quote.id, quote);
      return this.getQuoteTx(tx, principal.organizationId, quote.id);
    });
  }

  async updateQuote(principal: Principal, id: string, dto: UpdateQuoteDto) {
    const before = await this.requireQuote(principal, id);
    if (before.status !== 'DRAFT') {
      throw new ConflictException('Only DRAFT quotes can be edited.');
    }
    const calculated = dto.items ? calculateItems(dto.items) : undefined;
    if (dto.items && !calculated?.items.length) {
      throw new BadRequestException('Quote requires at least one item.');
    }

    return this.database.db.transaction(async (tx) => {
      const [quote] = await tx
        .update(businessQuotes)
        .set({
          validUntil: dto.validUntil,
          notes: dto.notes?.trim(),
          ...(calculated
            ? {
                subtotal: calculated.subtotal,
                discountAmount: calculated.discountAmount,
                taxAmount: calculated.taxAmount,
                total: calculated.total,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(businessQuotes.organizationId, principal.organizationId),
            eq(businessQuotes.id, id),
          ),
        )
        .returning();
      if (calculated) {
        await tx.delete(businessQuoteItems).where(eq(businessQuoteItems.quoteId, id));
        await tx.insert(businessQuoteItems).values(
          calculated.items.map((item, position) => ({
            organizationId: principal.organizationId,
            quoteId: id,
            position,
            ...item,
          })),
        );
      }
      await this.audit(tx, principal, quote.workspaceId, 'business_billing.quote.update', 'business_quote', quote.id, quote, before);
      return this.getQuoteTx(tx, principal.organizationId, id);
    });
  }

  async issueQuote(principal: Principal, id: string) {
    const before = await this.requireQuote(principal, id);
    if (before.status !== 'DRAFT') {
      throw new ConflictException('Only DRAFT quotes can be issued.');
    }
    const items = await this.database.db
      .select()
      .from(businessQuoteItems)
      .where(eq(businessQuoteItems.quoteId, id));
    if (!items.length || cents(before.total) <= 0) {
      throw new ConflictException('Quote must have a positive total before issue.');
    }
    const settings = await this.ensureSettings(principal, before.workspaceId);
    const snapshot = await this.customerSnapshot(
      principal,
      before.contactId ?? undefined,
      before.companyId ?? undefined,
    );

    return this.database.db.transaction(async (tx) => {
      const quoteNumber = await this.nextNumber(
        tx,
        principal.organizationId,
        before.workspaceId,
        'QUOTE',
        settings.quotePrefix,
      );
      const [quote] = await tx
        .update(businessQuotes)
        .set({
          quoteNumber,
          status: 'SENT',
          customerSnapshot: snapshot,
          issuedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(businessQuotes.organizationId, principal.organizationId),
            eq(businessQuotes.id, id),
            eq(businessQuotes.status, 'DRAFT'),
          ),
        )
        .returning();
      if (!quote) throw new ConflictException('Quote was already issued.');
      await this.eventAndAudit(
        tx,
        principal,
        quote.workspaceId,
        'business.quote.issued.v1',
        'business_quote',
        quote.id,
        { quoteId: quote.id, quoteNumber, total: quote.total, currency: quote.currency },
        'business_billing.quote.issue',
        quote,
        before,
      );
      return quote;
    });
  }

  async decideQuote(principal: Principal, id: string, dto: QuoteDecisionDto) {
    const before = await this.requireQuote(principal, id);
    if (before.status !== 'SENT') {
      throw new ConflictException('Only SENT quotes can be accepted or rejected.');
    }
    const [row] = await this.database.db
      .update(businessQuotes)
      .set({
        status: dto.status,
        acceptedAt: dto.status === 'ACCEPTED' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(businessQuotes.organizationId, principal.organizationId),
          eq(businessQuotes.id, id),
        ),
      )
      .returning();
    return row;
  }

  async listInvoices(principal: Principal, query: BillingListQueryDto) {
    await this.refreshOverdue(principal.organizationId, query.workspaceId);
    const rows = await this.database.db
      .select()
      .from(businessInvoices)
      .where(eq(businessInvoices.organizationId, principal.organizationId))
      .orderBy(desc(businessInvoices.createdAt))
      .limit(query.limit);
    return rows.filter(
      (row) =>
        (!query.workspaceId || row.workspaceId === query.workspaceId) &&
        (!query.status || row.status === query.status) &&
        (!query.contactId || row.contactId === query.contactId) &&
        (!query.companyId || row.companyId === query.companyId) &&
        (!query.dealId || row.dealId === query.dealId),
    );
  }

  async getInvoice(principal: Principal, id: string) {
    const invoice = await this.requireInvoice(principal, id);
    const [items, payments, creditNotes] = await Promise.all([
      this.database.db
        .select()
        .from(businessInvoiceItems)
        .where(eq(businessInvoiceItems.invoiceId, id))
        .orderBy(businessInvoiceItems.position),
      this.database.db
        .select()
        .from(businessPayments)
        .where(
          and(
            eq(businessPayments.organizationId, principal.organizationId),
            eq(businessPayments.invoiceId, id),
          ),
        )
        .orderBy(desc(businessPayments.paidAt)),
      this.database.db
        .select()
        .from(businessCreditNotes)
        .where(
          and(
            eq(businessCreditNotes.organizationId, principal.organizationId),
            eq(businessCreditNotes.invoiceId, id),
          ),
        )
        .orderBy(desc(businessCreditNotes.issuedAt)),
    ]);
    return { invoice, items, payments, creditNotes };
  }

  async createInvoice(principal: Principal, dto: CreateInvoiceDto) {
    const workspace = await this.resolveWorkspace(principal, dto.workspaceId);
    const settings = await this.ensureSettings(principal, workspace.id);
    let items = dto.items ?? [];
    let contactId = dto.contactId;
    let companyId = dto.companyId;
    let dealId = dto.dealId;
    let quoteId = dto.quoteId;
    let currency = dto.currency ?? settings.currency;

    if (quoteId) {
      const quote = await this.requireQuote(principal, quoteId);
      if (!['ACCEPTED', 'SENT'].includes(quote.status)) {
        throw new ConflictException('Only SENT or ACCEPTED quotes can become invoices.');
      }
      if (quote.workspaceId !== workspace.id) {
        throw new BadRequestException('Quote belongs to another workspace.');
      }
      const quoteItems = await this.database.db
        .select()
        .from(businessQuoteItems)
        .where(eq(businessQuoteItems.quoteId, quoteId))
        .orderBy(businessQuoteItems.position);
      items = quoteItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount,
        taxRatePercent: item.taxRatePercent,
        metadata: item.metadata ?? undefined,
      }));
      contactId = quote.contactId ?? undefined;
      companyId = quote.companyId ?? undefined;
      dealId = quote.dealId ?? undefined;
      currency = quote.currency;
    }

    if (!contactId && !companyId) {
      throw new BadRequestException('Invoice requires a CRM contact or company.');
    }
    await this.validateCustomerRefs(principal, contactId, companyId, dealId);
    const calculated = calculateItems(items);
    if (!calculated.items.length) {
      throw new BadRequestException('Invoice requires at least one item.');
    }

    return this.database.db.transaction(async (tx) => {
      const [invoice] = await tx
        .insert(businessInvoices)
        .values({
          organizationId: principal.organizationId,
          workspaceId: workspace.id,
          quoteId,
          contactId,
          companyId,
          dealId,
          ownerMemberId: principal.membershipId,
          currency,
          subtotal: calculated.subtotal,
          discountAmount: calculated.discountAmount,
          taxAmount: calculated.taxAmount,
          total: calculated.total,
          balanceDue: calculated.total,
          issueDate: dto.issueDate,
          dueDate: dto.dueDate,
          notes: dto.notes?.trim(),
        })
        .returning();
      await tx.insert(businessInvoiceItems).values(
        calculated.items.map((item, position) => ({
          organizationId: principal.organizationId,
          invoiceId: invoice.id,
          position,
          ...item,
        })),
      );
      await this.audit(tx, principal, workspace.id, 'business_billing.invoice.create', 'business_invoice', invoice.id, invoice);
      return this.getInvoiceTx(tx, principal.organizationId, invoice.id);
    });
  }

  async updateInvoice(principal: Principal, id: string, dto: UpdateInvoiceDto) {
    const before = await this.requireInvoice(principal, id);
    if (before.status !== 'DRAFT') {
      throw new ConflictException('Only DRAFT invoices can be edited.');
    }
    const calculated = dto.items ? calculateItems(dto.items) : undefined;
    return this.database.db.transaction(async (tx) => {
      const [invoice] = await tx
        .update(businessInvoices)
        .set({
          issueDate: dto.issueDate,
          dueDate: dto.dueDate,
          notes: dto.notes?.trim(),
          ...(calculated
            ? {
                subtotal: calculated.subtotal,
                discountAmount: calculated.discountAmount,
                taxAmount: calculated.taxAmount,
                total: calculated.total,
                balanceDue: calculated.total,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(businessInvoices.organizationId, principal.organizationId),
            eq(businessInvoices.id, id),
          ),
        )
        .returning();
      if (calculated) {
        await tx
          .delete(businessInvoiceItems)
          .where(eq(businessInvoiceItems.invoiceId, id));
        await tx.insert(businessInvoiceItems).values(
          calculated.items.map((item, position) => ({
            organizationId: principal.organizationId,
            invoiceId: id,
            position,
            ...item,
          })),
        );
      }
      await this.audit(tx, principal, invoice.workspaceId, 'business_billing.invoice.update', 'business_invoice', id, invoice, before);
      return this.getInvoiceTx(tx, principal.organizationId, id);
    });
  }

  async issueInvoice(principal: Principal, id: string) {
    const before = await this.requireInvoice(principal, id);
    if (before.status !== 'DRAFT') {
      throw new ConflictException('Only DRAFT invoices can be issued.');
    }
    if (cents(before.total) <= 0) {
      throw new ConflictException('Invoice total must be positive.');
    }
    const settings = await this.ensureSettings(principal, before.workspaceId);
    const snapshot = await this.customerSnapshot(
      principal,
      before.contactId ?? undefined,
      before.companyId ?? undefined,
    );
    const today = new Date();
    const issueDate = before.issueDate ?? isoDate(today);
    const dueDate =
      before.dueDate ??
      isoDate(
        new Date(
          today.getTime() +
            settings.defaultPaymentTermsDays * 24 * 60 * 60 * 1000,
        ),
      );

    return this.database.db.transaction(async (tx) => {
      const invoiceNumber = await this.nextNumber(
        tx,
        principal.organizationId,
        before.workspaceId,
        'INVOICE',
        settings.invoicePrefix,
      );
      const [invoice] = await tx
        .update(businessInvoices)
        .set({
          invoiceNumber,
          status: 'ISSUED',
          customerSnapshot: snapshot,
          issueDate,
          dueDate,
          issuedAt: new Date(),
          balanceDue: before.total,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(businessInvoices.organizationId, principal.organizationId),
            eq(businessInvoices.id, id),
            eq(businessInvoices.status, 'DRAFT'),
          ),
        )
        .returning();
      if (!invoice) throw new ConflictException('Invoice was already issued.');
      if (invoice.quoteId) {
        await tx
          .update(businessQuotes)
          .set({ status: 'CONVERTED', updatedAt: new Date() })
          .where(
            and(
              eq(businessQuotes.organizationId, principal.organizationId),
              eq(businessQuotes.id, invoice.quoteId),
            ),
          );
      }
      await this.eventAndAudit(
        tx,
        principal,
        invoice.workspaceId,
        'business.invoice.issued.v1',
        'business_invoice',
        invoice.id,
        {
          invoiceId: invoice.id,
          invoiceNumber,
          total: invoice.total,
          balanceDue: invoice.balanceDue,
          dueDate: invoice.dueDate,
          currency: invoice.currency,
        },
        'business_billing.invoice.issue',
        invoice,
        before,
      );
      return invoice;
    });
  }

  async recordPayment(principal: Principal, invoiceId: string, dto: CreatePaymentDto) {
    const invoice = await this.requireInvoice(principal, invoiceId);
    if (!['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status)) {
      throw new ConflictException('Payment requires an open issued invoice.');
    }
    const amount = cents(dto.amount);
    if (amount <= 0 || amount > cents(invoice.balanceDue)) {
      throw new BadRequestException('Payment must be positive and cannot exceed balance due.');
    }
    const settings = await this.ensureSettings(principal, invoice.workspaceId);

    return this.database.db.transaction(async (tx) => {
      const receiptNumber = await this.nextNumber(
        tx,
        principal.organizationId,
        invoice.workspaceId,
        'RECEIPT',
        settings.receiptPrefix,
      );
      const [payment] = await tx
        .insert(businessPayments)
        .values({
          organizationId: principal.organizationId,
          workspaceId: invoice.workspaceId,
          invoiceId,
          receiptNumber,
          amount: money(amount),
          currency: invoice.currency,
          method: dto.method,
          reference: dto.reference?.trim(),
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          notes: dto.notes?.trim(),
          createdByMemberId: principal.membershipId,
        })
        .returning();
      const updated = await this.recalculateInvoiceTx(tx, principal, invoiceId);
      await this.eventAndAudit(
        tx,
        principal,
        invoice.workspaceId,
        'business.payment.received.v1',
        'business_payment',
        payment.id,
        {
          paymentId: payment.id,
          invoiceId,
          receiptNumber,
          amount: payment.amount,
          balanceDue: updated.balanceDue,
        },
        'business_billing.payment.record',
        payment,
      );
      return { payment, invoice: updated };
    });
  }

  async issueCreditNote(
    principal: Principal,
    invoiceId: string,
    dto: CreateCreditNoteDto,
  ) {
    const invoice = await this.requireInvoice(principal, invoiceId);
    if (!['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status)) {
      throw new ConflictException('Credit note requires an open issued invoice.');
    }
    const amount = cents(dto.amount);
    if (amount <= 0 || amount > cents(invoice.balanceDue)) {
      throw new BadRequestException('Credit note cannot exceed the current balance due.');
    }
    const settings = await this.ensureSettings(principal, invoice.workspaceId);

    return this.database.db.transaction(async (tx) => {
      const creditNoteNumber = await this.nextNumber(
        tx,
        principal.organizationId,
        invoice.workspaceId,
        'CREDIT_NOTE',
        settings.creditNotePrefix,
      );
      const [creditNote] = await tx
        .insert(businessCreditNotes)
        .values({
          organizationId: principal.organizationId,
          workspaceId: invoice.workspaceId,
          invoiceId,
          creditNoteNumber,
          amount: money(amount),
          currency: invoice.currency,
          reason: dto.reason.trim(),
          createdByMemberId: principal.membershipId,
        })
        .returning();
      const updated = await this.recalculateInvoiceTx(tx, principal, invoiceId);
      await this.eventAndAudit(
        tx,
        principal,
        invoice.workspaceId,
        'business.credit_note.issued.v1',
        'business_credit_note',
        creditNote.id,
        {
          creditNoteId: creditNote.id,
          invoiceId,
          creditNoteNumber,
          amount: creditNote.amount,
          balanceDue: updated.balanceDue,
        },
        'business_billing.credit_note.issue',
        creditNote,
      );
      return { creditNote, invoice: updated };
    });
  }

  private async ensureSettings(principal: Principal, workspaceId: string) {
    const existing = await this.database.db
      .select()
      .from(businessBillingSettings)
      .where(
        and(
          eq(businessBillingSettings.organizationId, principal.organizationId),
          eq(businessBillingSettings.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0];
    const org = await this.database.db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, principal.organizationId))
      .limit(1);
    const [created] = await this.database.db
      .insert(businessBillingSettings)
      .values({
        organizationId: principal.organizationId,
        workspaceId,
        legalName: org[0]?.name ?? 'Business',
      })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const retry = await this.database.db
      .select()
      .from(businessBillingSettings)
      .where(
        and(
          eq(businessBillingSettings.organizationId, principal.organizationId),
          eq(businessBillingSettings.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    return retry[0];
  }

  private async resolveWorkspace(principal: Principal, workspaceId?: string) {
    const rows = await this.database.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(
        workspaceId
          ? and(
              eq(workspaces.organizationId, principal.organizationId),
              eq(workspaces.id, workspaceId),
            )
          : eq(workspaces.organizationId, principal.organizationId),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Workspace not found.');
    return rows[0];
  }

  private async validateCustomerRefs(
    principal: Principal,
    contactId?: string,
    companyId?: string,
    dealId?: string,
  ) {
    if (contactId) await this.requireCrm(principal, contacts, contactId, 'Contact');
    if (companyId) await this.requireCrm(principal, companies, companyId, 'Company');
    if (dealId) await this.requireCrm(principal, deals, dealId, 'Deal');
  }

  private async requireCrm(
    principal: Principal,
    table: typeof contacts | typeof companies | typeof deals,
    id: string,
    label: string,
  ) {
    const queryTable = table as unknown as typeof contacts;
    const rows = await this.database.db
      .select({ id: queryTable.id })
      .from(queryTable)
      .where(
        and(
          eq(queryTable.organizationId, principal.organizationId),
          eq(queryTable.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException(`${label} not found.`);
  }

  private async customerSnapshot(
    principal: Principal,
    contactId?: string,
    companyId?: string,
  ) {
    const snapshot: Record<string, unknown> = {};
    if (contactId) {
      const rows = await this.database.db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.organizationId, principal.organizationId),
            eq(contacts.id, contactId),
          ),
        )
        .limit(1);
      if (!rows[0]) throw new NotFoundException('Contact not found.');
      snapshot.contact = {
        id: rows[0].id,
        displayName: rows[0].displayName,
        email: rows[0].email,
        phone: rows[0].phone,
      };
    }
    if (companyId) {
      const rows = await this.database.db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.organizationId, principal.organizationId),
            eq(companies.id, companyId),
          ),
        )
        .limit(1);
      if (!rows[0]) throw new NotFoundException('Company not found.');
      snapshot.company = {
        id: rows[0].id,
        name: rows[0].name,
        website: rows[0].website,
        phone: rows[0].phone,
      };
    }
    return snapshot;
  }

  private async requireQuote(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(businessQuotes)
      .where(
        and(
          eq(businessQuotes.organizationId, principal.organizationId),
          eq(businessQuotes.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Quote not found.');
    return rows[0];
  }

  private async requireInvoice(principal: Principal, id: string) {
    const rows = await this.database.db
      .select()
      .from(businessInvoices)
      .where(
        and(
          eq(businessInvoices.organizationId, principal.organizationId),
          eq(businessInvoices.id, id),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException('Invoice not found.');
    return rows[0];
  }

  private async nextNumber(
    tx: Tx,
    organizationId: string,
    workspaceId: string,
    documentType: string,
    prefix: string,
  ) {
    const rows = await tx
      .insert(businessDocumentSequences)
      .values({
        organizationId,
        workspaceId,
        documentType,
        nextValue: 2,
      })
      .onConflictDoUpdate({
        target: [
          businessDocumentSequences.organizationId,
          businessDocumentSequences.workspaceId,
          businessDocumentSequences.documentType,
        ],
        set: {
          nextValue: sql`${businessDocumentSequences.nextValue} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning({ nextValue: businessDocumentSequences.nextValue });
    const assigned = rows[0].nextValue - 1;
    return `${prefix}-${String(assigned).padStart(6, '0')}`;
  }

  private async recalculateInvoiceTx(
    tx: Tx,
    principal: Principal,
    invoiceId: string,
  ) {
    const invoices = await tx
      .select()
      .from(businessInvoices)
      .where(
        and(
          eq(businessInvoices.organizationId, principal.organizationId),
          eq(businessInvoices.id, invoiceId),
        ),
      )
      .limit(1);
    const invoice = invoices[0];
    if (!invoice) throw new NotFoundException('Invoice not found.');

    const [payments, credits] = await Promise.all([
      tx
        .select()
        .from(businessPayments)
        .where(
          and(
            eq(businessPayments.organizationId, principal.organizationId),
            eq(businessPayments.invoiceId, invoiceId),
            eq(businessPayments.status, 'POSTED'),
          ),
        ),
      tx
        .select()
        .from(businessCreditNotes)
        .where(
          and(
            eq(businessCreditNotes.organizationId, principal.organizationId),
            eq(businessCreditNotes.invoiceId, invoiceId),
            eq(businessCreditNotes.status, 'ISSUED'),
          ),
        ),
    ]);
    const paid = payments.reduce((sum, row) => sum + cents(row.amount), 0);
    const credited = credits.reduce((sum, row) => sum + cents(row.amount), 0);
    const total = cents(invoice.total);
    const balance = Math.max(total - paid - credited, 0);
    const status =
      balance === 0
        ? paid === 0 && credited >= total
          ? 'CREDITED'
          : 'PAID'
        : paid > 0 || credited > 0
          ? 'PARTIALLY_PAID'
          : invoice.status === 'OVERDUE'
            ? 'OVERDUE'
            : 'ISSUED';
    const [updated] = await tx
      .update(businessInvoices)
      .set({
        paidAmount: money(paid),
        creditedAmount: money(credited),
        balanceDue: money(balance),
        status,
        paidAt: status === 'PAID' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(businessInvoices.id, invoiceId))
      .returning();
    return updated;
  }

  private async refreshOverdue(organizationId: string, workspaceId?: string) {
    const today = isoDate(new Date());
    await this.database.db
      .update(businessInvoices)
      .set({ status: 'OVERDUE', updatedAt: new Date() })
      .where(
        and(
          eq(businessInvoices.organizationId, organizationId),
          ...(workspaceId ? [eq(businessInvoices.workspaceId, workspaceId)] : []),
          eq(businessInvoices.status, 'ISSUED'),
          sql`${businessInvoices.dueDate} < ${today}`,
          sql`${businessInvoices.balanceDue} > 0`,
        ),
      );
  }

  private async getQuoteTx(tx: Tx, organizationId: string, id: string) {
    const [quotes, items] = await Promise.all([
      tx
        .select()
        .from(businessQuotes)
        .where(
          and(
            eq(businessQuotes.organizationId, organizationId),
            eq(businessQuotes.id, id),
          ),
        )
        .limit(1),
      tx
        .select()
        .from(businessQuoteItems)
        .where(
          and(
            eq(businessQuoteItems.organizationId, organizationId),
            eq(businessQuoteItems.quoteId, id),
          ),
        )
        .orderBy(businessQuoteItems.position),
    ]);
    return { quote: quotes[0], items };
  }

  private async getInvoiceTx(tx: Tx, organizationId: string, id: string) {
    const [invoices, items] = await Promise.all([
      tx
        .select()
        .from(businessInvoices)
        .where(
          and(
            eq(businessInvoices.organizationId, organizationId),
            eq(businessInvoices.id, id),
          ),
        )
        .limit(1),
      tx
        .select()
        .from(businessInvoiceItems)
        .where(
          and(
            eq(businessInvoiceItems.organizationId, organizationId),
            eq(businessInvoiceItems.invoiceId, id),
          ),
        )
        .orderBy(businessInvoiceItems.position),
    ]);
    return { invoice: invoices[0], items, payments: [], creditNotes: [] };
  }

  private async eventAndAudit(
    tx: Tx,
    principal: Principal,
    workspaceId: string,
    eventType: string,
    resourceType: string,
    resourceId: string,
    payload: Record<string, unknown>,
    action: string,
    after: Record<string, unknown>,
    before?: Record<string, unknown>,
  ) {
    await tx.insert(outboxEvents).values({
      organizationId: principal.organizationId,
      eventType,
      aggregateType: resourceType,
      aggregateId: resourceId,
      payload,
    });
    await this.audit(tx, principal, workspaceId, action, resourceType, resourceId, after, before);
  }

  private async audit(
    tx: Tx,
    principal: Principal,
    workspaceId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    after: Record<string, unknown>,
    before?: Record<string, unknown>,
  ) {
    await tx.insert(auditLogs).values({
      organizationId: principal.organizationId,
      workspaceId,
      actorType: principal.actorType ?? 'USER',
      actorId: principal.actorId ?? principal.userId,
      action,
      resourceType,
      resourceId,
      before,
      after,
    });
  }
}

function calculateItems(items: DocumentItemDto[]) {
  const calculated = items.map((item) => {
    const quantity = Number(item.quantity);
    const unit = cents(item.unitPrice);
    const discount = cents(item.discountAmount ?? '0');
    const taxRate = Number(item.taxRatePercent ?? '0');
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('Item quantity must be positive.');
    }
    if (unit < 0 || discount < 0 || taxRate < 0 || taxRate > 100) {
      throw new BadRequestException('Invalid item financial values.');
    }
    const gross = Math.round(unit * quantity);
    if (discount > gross) {
      throw new BadRequestException('Line discount cannot exceed gross line value.');
    }
    const taxable = gross - discount;
    const tax = Math.round((taxable * taxRate) / 100);
    return {
      description: item.description.trim(),
      quantity: normalizeDecimal(quantity, 3),
      unitPrice: money(unit),
      discountAmount: money(discount),
      taxRatePercent: normalizeDecimal(taxRate, 4),
      taxableAmount: money(taxable),
      taxAmount: money(tax),
      lineTotal: money(taxable + tax),
      metadata: item.metadata,
    };
  });
  return {
    items: calculated,
    subtotal: money(
      calculated.reduce(
        (sum, row) => sum + cents(row.taxableAmount) + cents(row.discountAmount),
        0,
      ),
    ),
    discountAmount: money(
      calculated.reduce((sum, row) => sum + cents(row.discountAmount), 0),
    ),
    taxAmount: money(
      calculated.reduce((sum, row) => sum + cents(row.taxAmount), 0),
    ),
    total: money(
      calculated.reduce((sum, row) => sum + cents(row.lineTotal), 0),
    ),
  };
}

function cents(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return 0;
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new BadRequestException('Invalid monetary value.');
  return Math.round(amount * 100);
}

function money(valueInCents: number) {
  return (valueInCents / 100).toFixed(2);
}

function normalizeDecimal(value: number, scale: number) {
  return value.toFixed(scale).replace(/\.?0+$/, '');
}

function cleanPrefix(value: string) {
  const prefix = value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!prefix) throw new BadRequestException('Document prefix cannot be empty.');
  return prefix.slice(0, 24);
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
