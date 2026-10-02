import { BadRequestException, Injectable } from '@nestjs/common';
import type { Principal } from '../../platform/auth/auth.types.js';
import { DatabaseService } from '../../platform/database/database.service.js';
import type { AnalyticsRangeQueryDto } from '../business-billing/dto/business-billing.dto.js';

type QueryRange = {
  from: Date;
  to: Date;
  workspaceId?: string;
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly database: DatabaseService) {}

  async overview(principal: Principal, query: AnalyticsRangeQueryDto) {
    const range = this.range(query);
    const [
      finance,
      crm,
      communication,
      ai,
      attendance,
      realEstate,
      salespeople,
      aging,
      timeseries,
    ] = await Promise.all([
      this.finance(principal, range),
      this.crm(principal, range),
      this.communication(principal, range),
      this.ai(principal, range),
      this.attendance(principal, range),
      this.realEstate(principal, range),
      this.salespeople(principal, range),
      this.receivablesAging(principal, range),
      this.timeseries(principal, range),
    ]);

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        workspaceId: range.workspaceId ?? null,
      },
      finance,
      crm,
      communication,
      ai,
      attendance,
      realEstate,
      salespeople,
      receivablesAging: aging,
      timeseries,
    };
  }

  async finance(principal: Principal, range: QueryRange) {
    const params = this.params(principal.organizationId, range);
    const result = await this.database.pool.query<{
      invoiced: string;
      collected: string;
      outstanding: string;
      overdue: string;
      invoice_count: string;
      paid_invoice_count: string;
    }>(
      `
      select
        coalesce(sum(i.total) filter (
          where i.status not in ('DRAFT','VOID')
            and i.issued_at >= $2 and i.issued_at < $3
        ), 0)::text as invoiced,
        coalesce((
          select sum(p.amount)
          from business_payments p
          where p.organization_id = $1
            and p.status = 'POSTED'
            and p.paid_at >= $2 and p.paid_at < $3
            ${range.workspaceId ? 'and p.workspace_id = $4' : ''}
        ), 0)::text as collected,
        coalesce(sum(i.balance_due) filter (
          where i.status in ('ISSUED','PARTIALLY_PAID','OVERDUE')
        ), 0)::text as outstanding,
        coalesce(sum(i.balance_due) filter (
          where i.status = 'OVERDUE'
        ), 0)::text as overdue,
        count(*) filter (
          where i.status not in ('DRAFT','VOID')
            and i.issued_at >= $2 and i.issued_at < $3
        )::text as invoice_count,
        count(*) filter (
          where i.status = 'PAID'
            and i.paid_at >= $2 and i.paid_at < $3
        )::text as paid_invoice_count
      from business_invoices i
      where i.organization_id = $1
        ${range.workspaceId ? 'and i.workspace_id = $4' : ''}
      `,
      params,
    );
    const row = result.rows[0];
    const invoiced = metricNumber(row?.invoiced);
    const collected = metricNumber(row?.collected);
    return {
      invoiced,
      collected,
      outstanding: metricNumber(row?.outstanding),
      overdue: metricNumber(row?.overdue),
      invoiceCount: metricNumber(row?.invoice_count),
      paidInvoiceCount: metricNumber(row?.paid_invoice_count),
      collectionRate:
        invoiced > 0 ? Number(((collected / invoiced) * 100).toFixed(2)) : 0,
    };
  }

  async crm(principal: Principal, range: QueryRange) {
    const params = this.params(principal.organizationId, range);
    const result = await this.database.pool.query<{
      leads_created: string;
      qualified_leads: string;
      hot_leads: string;
      deals_created: string;
      won_deals: string;
      lost_deals: string;
      open_pipeline: string;
      won_value: string;
    }>(
      `
      select
        (select count(*) from crm_leads l
          where l.organization_id = $1
            and l.created_at >= $2 and l.created_at < $3
            ${range.workspaceId ? 'and l.workspace_id = $4' : ''})::text as leads_created,
        (select count(*) from crm_leads l
          where l.organization_id = $1 and l.status = 'QUALIFIED'
            and l.updated_at >= $2 and l.updated_at < $3
            ${range.workspaceId ? 'and l.workspace_id = $4' : ''})::text as qualified_leads,
        (select count(*) from crm_leads l
          where l.organization_id = $1 and l.temperature = 'HOT'
            and l.created_at >= $2 and l.created_at < $3
            ${range.workspaceId ? 'and l.workspace_id = $4' : ''})::text as hot_leads,
        (select count(*) from crm_deals d
          where d.organization_id = $1
            and d.created_at >= $2 and d.created_at < $3
            ${range.workspaceId ? 'and d.workspace_id = $4' : ''})::text as deals_created,
        (select count(*) from crm_deals d
          where d.organization_id = $1 and d.status = 'WON'
            and d.closed_at >= $2 and d.closed_at < $3
            ${range.workspaceId ? 'and d.workspace_id = $4' : ''})::text as won_deals,
        (select count(*) from crm_deals d
          where d.organization_id = $1 and d.status = 'LOST'
            and d.closed_at >= $2 and d.closed_at < $3
            ${range.workspaceId ? 'and d.workspace_id = $4' : ''})::text as lost_deals,
        coalesce((select sum(d.amount) from crm_deals d
          where d.organization_id = $1 and d.status = 'OPEN'
            ${range.workspaceId ? 'and d.workspace_id = $4' : ''}), 0)::text as open_pipeline,
        coalesce((select sum(d.amount) from crm_deals d
          where d.organization_id = $1 and d.status = 'WON'
            and d.closed_at >= $2 and d.closed_at < $3
            ${range.workspaceId ? 'and d.workspace_id = $4' : ''}), 0)::text as won_value
      `,
      params,
    );
    const row = result.rows[0];
    const won = metricNumber(row?.won_deals);
    const lost = metricNumber(row?.lost_deals);
    return {
      leadsCreated: metricNumber(row?.leads_created),
      qualifiedLeads: metricNumber(row?.qualified_leads),
      hotLeads: metricNumber(row?.hot_leads),
      dealsCreated: metricNumber(row?.deals_created),
      wonDeals: won,
      lostDeals: lost,
      openPipeline: metricNumber(row?.open_pipeline),
      wonValue: metricNumber(row?.won_value),
      winRate:
        won + lost > 0 ? Number(((won / (won + lost)) * 100).toFixed(2)) : 0,
    };
  }

  async communication(principal: Principal, range: QueryRange) {
    const params = this.params(principal.organizationId, range);
    const result = await this.database.pool.query<{
      conversations: string;
      inbound: string;
      outbound: string;
      delivered: string;
      failed: string;
      campaigns: string;
      recipients: string;
      recipients_sent: string;
      recipients_failed: string;
    }>(
      `
      select
        (select count(*) from communication_conversations c
          where c.organization_id = $1
            and c.created_at >= $2 and c.created_at < $3
            ${range.workspaceId ? 'and c.workspace_id = $4' : ''})::text as conversations,
        (select count(*) from communication_messages m
          join communication_conversations c on c.id = m.conversation_id
          where m.organization_id = $1 and m.direction = 'INBOUND'
            and m.created_at >= $2 and m.created_at < $3
            ${range.workspaceId ? 'and c.workspace_id = $4' : ''})::text as inbound,
        (select count(*) from communication_messages m
          join communication_conversations c on c.id = m.conversation_id
          where m.organization_id = $1 and m.direction = 'OUTBOUND'
            and m.created_at >= $2 and m.created_at < $3
            ${range.workspaceId ? 'and c.workspace_id = $4' : ''})::text as outbound,
        (select count(*) from communication_messages m
          join communication_conversations c on c.id = m.conversation_id
          where m.organization_id = $1 and m.status in ('SENT','DELIVERED','READ')
            and m.created_at >= $2 and m.created_at < $3
            ${range.workspaceId ? 'and c.workspace_id = $4' : ''})::text as delivered,
        (select count(*) from communication_messages m
          join communication_conversations c on c.id = m.conversation_id
          where m.organization_id = $1 and m.status = 'FAILED'
            and m.created_at >= $2 and m.created_at < $3
            ${range.workspaceId ? 'and c.workspace_id = $4' : ''})::text as failed,
        (select count(*) from communication_campaigns c
          where c.organization_id = $1
            and c.created_at >= $2 and c.created_at < $3
            ${range.workspaceId ? 'and c.workspace_id = $4' : ''})::text as campaigns,
        (select count(*) from communication_campaign_recipients r
          join communication_campaigns c on c.id = r.campaign_id
          where r.organization_id = $1
            and r.created_at >= $2 and r.created_at < $3
            ${range.workspaceId ? 'and c.workspace_id = $4' : ''})::text as recipients,
        (select count(*) from communication_campaign_recipients r
          join communication_campaigns c on c.id = r.campaign_id
          where r.organization_id = $1 and r.status in ('SENT','DELIVERED','READ')
            and r.updated_at >= $2 and r.updated_at < $3
            ${range.workspaceId ? 'and c.workspace_id = $4' : ''})::text as recipients_sent,
        (select count(*) from communication_campaign_recipients r
          join communication_campaigns c on c.id = r.campaign_id
          where r.organization_id = $1 and r.status = 'FAILED'
            and r.updated_at >= $2 and r.updated_at < $3
            ${range.workspaceId ? 'and c.workspace_id = $4' : ''})::text as recipients_failed
      `,
      params,
    );
    const row = result.rows[0];
    const outbound = metricNumber(row?.outbound);
    const failed = metricNumber(row?.failed);
    return {
      conversations: metricNumber(row?.conversations),
      inboundMessages: metricNumber(row?.inbound),
      outboundMessages: outbound,
      deliveredMessages: metricNumber(row?.delivered),
      failedMessages: failed,
      messageSuccessRate:
        outbound > 0 ? Number((((outbound - failed) / outbound) * 100).toFixed(2)) : 0,
      campaigns: metricNumber(row?.campaigns),
      campaignRecipients: metricNumber(row?.recipients),
      campaignSent: metricNumber(row?.recipients_sent),
      campaignFailed: metricNumber(row?.recipients_failed),
    };
  }

  async ai(principal: Principal, range: QueryRange) {
    const params = this.params(principal.organizationId, range);
    const result = await this.database.pool.query<{
      runs: string;
      completed: string;
      failed: string;
      tokens: string;
      cost: string;
      avg_latency: string;
    }>(
      `
      select
        count(*)::text as runs,
        count(*) filter (where r.status = 'COMPLETED')::text as completed,
        count(*) filter (where r.status = 'FAILED')::text as failed,
        coalesce(sum(r.total_tokens),0)::text as tokens,
        coalesce(sum(r.estimated_cost_usd),0)::text as cost,
        coalesce(avg(r.latency_ms) filter (where r.latency_ms is not null),0)::text as avg_latency
      from ai_runs r
      where r.organization_id = $1
        and r.started_at >= $2 and r.started_at < $3
        ${range.workspaceId ? 'and r.workspace_id = $4' : ''}
      `,
      params,
    );
    const row = result.rows[0];
    const runs = metricNumber(row?.runs);
    const completed = metricNumber(row?.completed);
    return {
      runs,
      completed,
      failed: metricNumber(row?.failed),
      totalTokens: metricNumber(row?.tokens),
      estimatedCostUsd: metricNumber(row?.cost),
      averageLatencyMs: Math.round(metricNumber(row?.avg_latency)),
      successRate: runs > 0 ? Number(((completed / runs) * 100).toFixed(2)) : 0,
    };
  }

  async attendance(principal: Principal, range: QueryRange) {
    const params = this.params(principal.organizationId, range);
    const result = await this.database.pool.query<{
      records: string;
      present: string;
      absent: string;
      leave: string;
      work_minutes: string;
      late_minutes: string;
      overtime_minutes: string;
    }>(
      `
      select
        count(*)::text as records,
        count(*) filter (where r.status in ('PRESENT','HALF_DAY'))::text as present,
        count(*) filter (where r.status = 'ABSENT')::text as absent,
        count(*) filter (where r.status = 'LEAVE')::text as leave,
        coalesce(sum(r.work_minutes),0)::text as work_minutes,
        coalesce(sum(r.late_minutes),0)::text as late_minutes,
        coalesce(sum(r.overtime_minutes),0)::text as overtime_minutes
      from attendance_records r
      where r.organization_id = $1
        and r.attendance_date >= $2::date
        and r.attendance_date < $3::date
        ${range.workspaceId ? 'and r.workspace_id = $4' : ''}
      `,
      params,
    );
    const row = result.rows[0];
    return {
      records: metricNumber(row?.records),
      present: metricNumber(row?.present),
      absent: metricNumber(row?.absent),
      leave: metricNumber(row?.leave),
      workHours: Number((metricNumber(row?.work_minutes) / 60).toFixed(1)),
      lateMinutes: metricNumber(row?.late_minutes),
      overtimeHours: Number((metricNumber(row?.overtime_minutes) / 60).toFixed(1)),
    };
  }

  async realEstate(principal: Principal, range: QueryRange) {
    const params = this.params(principal.organizationId, range);
    const result = await this.database.pool.query<{
      requirements: string;
      site_visits: string;
      completed_visits: string;
      bookings: string;
      confirmed_bookings: string;
      booking_amount: string;
    }>(
      `
      select
        (select count(*) from re_requirements r
          where r.organization_id = $1
            and r.created_at >= $2 and r.created_at < $3
            ${range.workspaceId ? 'and r.workspace_id = $4' : ''})::text as requirements,
        (select count(*) from re_site_visits v
          where v.organization_id = $1
            and v.created_at >= $2 and v.created_at < $3
            ${range.workspaceId ? 'and v.workspace_id = $4' : ''})::text as site_visits,
        (select count(*) from re_site_visits v
          where v.organization_id = $1 and v.status = 'COMPLETED'
            and v.updated_at >= $2 and v.updated_at < $3
            ${range.workspaceId ? 'and v.workspace_id = $4' : ''})::text as completed_visits,
        (select count(*) from re_bookings b
          where b.organization_id = $1
            and b.booked_at >= $2 and b.booked_at < $3
            ${range.workspaceId ? 'and b.workspace_id = $4' : ''})::text as bookings,
        (select count(*) from re_bookings b
          where b.organization_id = $1 and b.status = 'CONFIRMED'
            and b.updated_at >= $2 and b.updated_at < $3
            ${range.workspaceId ? 'and b.workspace_id = $4' : ''})::text as confirmed_bookings,
        coalesce((select sum(b.booking_amount) from re_bookings b
          where b.organization_id = $1 and b.status = 'CONFIRMED'
            and b.updated_at >= $2 and b.updated_at < $3
            ${range.workspaceId ? 'and b.workspace_id = $4' : ''}),0)::text as booking_amount
      `,
      params,
    );
    const row = result.rows[0];
    return {
      requirements: metricNumber(row?.requirements),
      siteVisits: metricNumber(row?.site_visits),
      completedVisits: metricNumber(row?.completed_visits),
      bookings: metricNumber(row?.bookings),
      confirmedBookings: metricNumber(row?.confirmed_bookings),
      confirmedBookingAmount: metricNumber(row?.booking_amount),
    };
  }

  async salespeople(principal: Principal, range: QueryRange) {
    const params = this.params(principal.organizationId, range);
    const result = await this.database.pool.query<{
      member_id: string;
      display_name: string;
      leads: string;
      open_deals: string;
      won_deals: string;
      pipeline_value: string;
      won_value: string;
    }>(
      `
      select
        om.id::text as member_id,
        u.display_name,
        coalesce(l.leads, 0)::text as leads,
        coalesce(d.open_deals, 0)::text as open_deals,
        coalesce(d.won_deals, 0)::text as won_deals,
        coalesce(d.pipeline_value, 0)::text as pipeline_value,
        coalesce(d.won_value, 0)::text as won_value
      from organization_members om
      join users u on u.id = om.user_id
      left join (
        select owner_member_id, count(*) as leads
        from crm_leads
        where organization_id = $1
          and created_at >= $2 and created_at < $3
          ${range.workspaceId ? 'and workspace_id = $4' : ''}
        group by owner_member_id
      ) l on l.owner_member_id = om.id
      left join (
        select
          owner_member_id,
          count(*) filter (where status = 'OPEN') as open_deals,
          count(*) filter (
            where status = 'WON'
              and closed_at >= $2 and closed_at < $3
          ) as won_deals,
          coalesce(sum(amount) filter (where status = 'OPEN'), 0) as pipeline_value,
          coalesce(sum(amount) filter (
            where status = 'WON'
              and closed_at >= $2 and closed_at < $3
          ), 0) as won_value
        from crm_deals
        where organization_id = $1
          ${range.workspaceId ? 'and workspace_id = $4' : ''}
        group by owner_member_id
      ) d on d.owner_member_id = om.id
      where om.organization_id = $1 and om.status = 'ACTIVE'
      order by coalesce(d.won_value, 0) desc
      limit 50
      `,
      params,
    );
    return result.rows.map((row) => ({
      memberId: row.member_id,
      displayName: row.display_name,
      leads: metricNumber(row.leads),
      openDeals: metricNumber(row.open_deals),
      wonDeals: metricNumber(row.won_deals),
      pipelineValue: metricNumber(row.pipeline_value),
      wonValue: metricNumber(row.won_value),
    }));
  }

  async receivablesAging(principal: Principal, range: QueryRange) {
    const today = utcDateOnly(new Date());
    const d30 = addUtcDays(today, -30);
    const d60 = addUtcDays(today, -60);
    const d90 = addUtcDays(today, -90);
    const params = range.workspaceId
      ? [
          principal.organizationId,
          isoDate(today),
          isoDate(d30),
          isoDate(d60),
          isoDate(d90),
          range.workspaceId,
        ]
      : [
          principal.organizationId,
          isoDate(today),
          isoDate(d30),
          isoDate(d60),
          isoDate(d90),
        ];
    const result = await this.database.pool.query<{
      current: string;
      d1_30: string;
      d31_60: string;
      d61_90: string;
      d90_plus: string;
    }>(
      `
      select
        coalesce(sum(case
          when due_date is null or due_date >= $2::date then balance_due
          else 0 end), 0)::text as current,
        coalesce(sum(case
          when due_date < $2::date and due_date >= $3::date then balance_due
          else 0 end), 0)::text as d1_30,
        coalesce(sum(case
          when due_date < $3::date and due_date >= $4::date then balance_due
          else 0 end), 0)::text as d31_60,
        coalesce(sum(case
          when due_date < $4::date and due_date >= $5::date then balance_due
          else 0 end), 0)::text as d61_90,
        coalesce(sum(case
          when due_date < $5::date then balance_due
          else 0 end), 0)::text as d90_plus
      from business_invoices
      where organization_id = $1
        and status in ('ISSUED','PARTIALLY_PAID','OVERDUE')
        and balance_due > 0
        ${range.workspaceId ? 'and workspace_id = $6' : ''}
      `,
      params,
    );
    const row = result.rows[0];
    return {
      current: metricNumber(row?.current),
      days1To30: metricNumber(row?.d1_30),
      days31To60: metricNumber(row?.d31_60),
      days61To90: metricNumber(row?.d61_90),
      days90Plus: metricNumber(row?.d90_plus),
    };
  }

  async timeseries(principal: Principal, range: QueryRange) {
    const params = this.params(principal.organizationId, range);
    const [payments, invoices, deals] = await Promise.all([
      this.database.pool.query<{ occurred_at: Date | string; value: string }>(
        `
        select paid_at as occurred_at, amount::text as value
        from business_payments
        where organization_id = $1
          and status = 'POSTED'
          and paid_at >= $2 and paid_at < $3
          ${range.workspaceId ? 'and workspace_id = $4' : ''}
        `,
        params,
      ),
      this.database.pool.query<{ occurred_at: Date | string; value: string }>(
        `
        select issued_at as occurred_at, total::text as value
        from business_invoices
        where organization_id = $1
          and status not in ('DRAFT','VOID')
          and issued_at >= $2 and issued_at < $3
          ${range.workspaceId ? 'and workspace_id = $4' : ''}
        `,
        params,
      ),
      this.database.pool.query<{ occurred_at: Date | string; value: string }>(
        `
        select closed_at as occurred_at, amount::text as value
        from crm_deals
        where organization_id = $1
          and status = 'WON'
          and closed_at >= $2 and closed_at < $3
          ${range.workspaceId ? 'and workspace_id = $4' : ''}
        `,
        params,
      ),
    ]);

    const collected = aggregateDaily(payments.rows);
    const invoiced = aggregateDaily(invoices.rows);
    const won = aggregateDaily(deals.rows);

    const rows: Array<{
      day: string;
      collected: number;
      invoiced: number;
      wonValue: number;
    }> = [];
    for (
      let cursor = startOfDay(range.from);
      cursor < range.to;
      cursor = addDays(cursor, 1)
    ) {
      const day = isoDate(cursor);
      rows.push({
        day,
        collected: collected.get(day) ?? 0,
        invoiced: invoiced.get(day) ?? 0,
        wonValue: won.get(day) ?? 0,
      });
    }
    return rows;
  }

  private range(query: AnalyticsRangeQueryDto): QueryRange {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to
    ) {
      throw new BadRequestException('Analytics date range is invalid.');
    }
    const maxDays = 366;
    if (to.getTime() - from.getTime() > maxDays * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Analytics range cannot exceed 366 days.');
    }
    return { from, to, workspaceId: query.workspaceId };
  }

  private params(organizationId: string, range: QueryRange) {
    return range.workspaceId
      ? [organizationId, range.from, range.to, range.workspaceId]
      : [organizationId, range.from, range.to];
  }
}

function startOfDay(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function utcDateOnly(value: Date) {
  const day = isoDate(value);
  return new Date(day + 'T00:00:00.000Z');
}

function addUtcDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function metricNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function aggregateDaily(
  rows: Array<{ occurred_at: Date | string; value: string }>,
) {
  const result = new Map<string, number>();
  for (const row of rows) {
    const date = new Date(row.occurred_at);
    if (Number.isNaN(date.getTime())) continue;
    const day = isoDate(date);
    result.set(day, (result.get(day) ?? 0) + metricNumber(row.value));
  }
  return result;
}
