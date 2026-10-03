import type { Pool } from 'pg';

export async function materializeOperationalNotifications(pool: Pool) {
  await pool.query(`
    insert into tenant_notifications (
      organization_id,
      category,
      severity,
      title,
      body,
      action_href,
      status,
      dedupe_key,
      metadata
    )
    select
      event.organization_id,
      case
        when event.event_type like 'saas.payment.%' then 'BILLING'
        when event.event_type like 'communication.%' then 'WHATSAPP'
        when event.event_type like 'ai.%' then 'AI'
        when event.event_type like 'automation.%' then 'AUTOMATION'
        when event.event_type like 'developer.%' then 'DEVELOPER'
        else 'OPERATIONS'
      end,
      case when event.status = 'FAILED' then 'CRITICAL' else 'WARNING' end,
      case
        when event.status = 'FAILED' then 'A background operation needs attention'
        when event.event_type like '%action_required%' then 'Action required'
        when event.event_type like '%reconciliation_required%' then 'Reconciliation required'
        when event.event_type like '%.failed.v1' then 'An operation reported a failure'
        else 'Operational attention required'
      end,
      'Business OS detected an operational event: ' || event.event_type,
      case
        when event.event_type like 'saas.payment.%' then '/subscription'
        when event.event_type like 'communication.%' then '/whatsapp'
        when event.event_type like 'ai.%' then '/ai-agents'
        when event.event_type like 'automation.%' then '/automations'
        when event.event_type like 'developer.%' then '/developer'
        else '/dashboard'
      end,
      'UNREAD',
      'outbox-event:' || event.id::text,
      jsonb_build_object(
        'eventId', event.id,
        'eventType', event.event_type,
        'outboxStatus', event.status,
        'aggregateType', event.aggregate_type,
        'aggregateId', event.aggregate_id
      )
    from outbox_events event
    where event.organization_id is not null
      and event.created_at >= now() - interval '30 days'
      and (
        event.status = 'FAILED'
        or event.event_type like '%action_required%'
        or event.event_type like '%reconciliation_required%'
        or event.event_type like '%.failed.v1'
      )
    on conflict (organization_id, dedupe_key) do nothing
  `);
}

export async function applyPlatformGovernanceRetention(pool: Pool) {
  await pool.query(`
    delete from audit_logs audit
    using data_governance_policies policy
    where audit.organization_id = policy.organization_id
      and policy.legal_hold = false
      and audit.created_at <
        now() - make_interval(days => policy.audit_retention_days)
  `);

  await pool.query(`
    delete from tenant_notifications notification
    using data_governance_policies policy
    where notification.organization_id = policy.organization_id
      and policy.legal_hold = false
      and notification.status in ('READ', 'ARCHIVED')
      and notification.created_at <
        now() - make_interval(days => policy.notification_retention_days)
  `);

  await pool.query(`
    delete from support_tickets ticket
    using data_governance_policies policy
    where ticket.organization_id = policy.organization_id
      and policy.legal_hold = false
      and ticket.status = 'CLOSED'
      and ticket.closed_at is not null
      and ticket.closed_at <
        now() - make_interval(days => policy.support_retention_days)
  `);

  await pool.query(`
    update ai_tool_executions execution
    set arguments = '{}'::jsonb,
        result = null,
        error_message = null
    from ai_runs run,
         data_governance_policies policy
    where execution.run_id = run.id
      and run.organization_id = policy.organization_id
      and policy.legal_hold = false
      and run.completed_at is not null
      and run.completed_at <
        now() - make_interval(days => policy.ai_trace_retention_days)
      and (
        execution.arguments <> '{}'::jsonb
        or execution.result is not null
        or execution.error_message is not null
      )
  `);

  await pool.query(`
    update ai_runs run
    set input = null,
        output = null,
        failure_message = null
    from data_governance_policies policy
    where run.organization_id = policy.organization_id
      and policy.legal_hold = false
      and run.completed_at is not null
      and run.completed_at <
        now() - make_interval(days => policy.ai_trace_retention_days)
      and (
        run.input is not null
        or run.output is not null
        or run.failure_message is not null
      )
  `);

  const due = await pool.query<{
    id: string;
    organization_id: string;
  }>(`
    update data_governance_requests request
    set status = 'ACTION_REQUIRED',
        updated_at = now()
    from data_governance_policies policy
    where request.organization_id = policy.organization_id
      and request.request_type = 'ERASURE'
      and request.status = 'APPROVED'
      and request.scheduled_at is not null
      and request.scheduled_at <= now()
      and policy.legal_hold = false
    returning request.id, request.organization_id
  `);

  for (const request of due.rows) {
    await pool.query(
      `insert into outbox_events (
         organization_id,
         event_type,
         aggregate_type,
         aggregate_id,
         payload
       ) values (
         $1,
         'governance.erasure.execution_required.v1',
         'data_governance_request',
         $2,
         $3::jsonb
       )`,
      [
        request.organization_id,
        request.id,
        JSON.stringify({
          requestId: request.id,
          safety:
            'Destructive tenant erasure requires an explicit controlled operator execution.',
        }),
      ],
    );
  }
}
