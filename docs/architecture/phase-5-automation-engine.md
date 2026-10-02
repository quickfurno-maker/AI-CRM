# Phase 5 — Governed Automation Engine

## Status

Phase 5 is complete and certified.

The Automation Canvas is a visual control plane over a durable, versioned backend execution engine. The browser does not execute business workflows.

## Runtime

Supported nodes:
- ACTION
- CONDITION
- WAIT
- APPROVAL
- END

Supported actions:
- CRM_CREATE_TASK
- CRM_UPDATE_LEAD
- WHATSAPP_SEND_TEXT
- WHATSAPP_SEND_TEMPLATE
- AI_RUN_AGENT
- SET_CONVERSATION_MODE

Runtime guarantees:
- immutable ACTIVE workflow versions
- tenant-scoped execution
- event idempotency
- correlation/causation IDs
- durable waits
- human approval gates
- max-step protection
- outbox/event integration
- run/step audit trail
- operator reconciliation for ambiguous external effects

## Retry and failure safety

Automatic retry is deliberately limited.

Safe retry is available only for actions with idempotent/state-setting semantics:
- CRM_UPDATE_LEAD
- WHATSAPP_SEND_TEXT
- WHATSAPP_SEND_TEMPLATE
- SET_CONVERSATION_MODE

Retry supports:
- maxAttempts
- exponential backoff
- multiplier
- maxBackoffSeconds

Ambiguous external actions do not blindly retry.

AI or external-provider failures that may have produced a side effect enter ACTION_REQUIRED. An operator must confirm that no side effect occurred before retrying, or cancel the run.

## Run controls

Operators can:
- pause RUNNING / WAITING runs
- resume paused runs
- cancel non-terminal runs
- reconcile ACTION_REQUIRED runs
- explicitly confirm and retry
- cancel after reconciliation

All operator controls are tenant-scoped and audited.

## Restart recovery

The scheduler continuously reconciles runtime state.

If a process restarts during a deterministic non-ACTION node:
- the interrupted step is marked RECOVERED_INTERRUPTED
- the run is safely resumed

If a process restarts while an ACTION may have been executing:
- the run becomes ACTION_REQUIRED
- automatic replay is blocked
- an operator must reconcile the external side effect

This prevents duplicate real-world actions.

## Event consumer

Automation events use Redis Streams with a consumer group.

Features:
- XREADGROUP
- XAUTOCLAIM
- pending-event recovery
- durable acknowledgements
- malformed-event fail-safe handling
- tenant identity carried from trusted outbox events

The outbox worker publishes canonical domain events into:
`crm-ai:events`

## Scheduler

The scheduler handles:
- due WAIT runs
- expired approvals
- stale RUNNING run reconciliation
- restart recovery

Multiple instances use database row locking / SKIP LOCKED behavior so due runs are not claimed by multiple schedulers.

## Automation Control Center

Route:
`/automations`

The UI includes:
- workflow list
- version selector
- Draft → Active lifecycle
- React Flow visual canvas
- minimap / pan / zoom
- ACTION / CONDITION / WAIT / APPROVAL / END palette
- typed edge branches
- typed node inspector
- advanced JSON escape hatch
- graph validation
- activation controls
- manual test runs
- approval queue
- run history
- live execution trace
- current-node highlighting
- completed-node highlighting
- pause / resume / cancel
- ACTION_REQUIRED reconciliation
- version-to-version graph comparison

Typed ACTION configuration supports:
- CRM tasks
- lead qualification updates
- WhatsApp text
- WhatsApp templates
- AI agent runs
- conversation handling mode

## Certified cross-module journey

The acceptance journey now passes as one integrated Business OS flow:

```
CRM lead event
→ AI qualification
→ lead scoring / qualification
→ WhatsApp follow-up
→ durable wait
→ second WhatsApp follow-up
→ human handoff
→ workflow complete
```

Certification verifies:
- AI run completes
- lead becomes HOT / QUALIFIED with score
- exactly two outbound WhatsApp messages are produced
- conversation ends in HUMAN mode
- duplicate trigger event is ignored
- duplicate WhatsApp side effects are not produced

## Hardening certification

Additional end-to-end coverage proves:
- safe action retry/backoff
- RETRY_WAIT state
- pause
- resume
- cancellation
- ACTION_REQUIRED
- reconciliation proof requirement
- cross-tenant control denial
- wait/resume behavior
- approvals
- branching
- event idempotency

## Environment parsing hardening

Boolean environment configuration no longer uses generic string coercion.

Values such as:
- false
- 0
- no
- off

correctly disable background services.

This was verified using the real API startup path: Automation consumer + scheduler enabled while AI WhatsApp consumer remained disabled.

## Local infrastructure

CRM-AI now uses an isolated local development stack:

PostgreSQL:
- pgvector/pgvector:0.8.6-pg17-trixie
- localhost:15432

Redis:
- redis:8-alpine
- localhost:16379

This avoids collision with the existing Jarvis PostgreSQL container on port 55432.

Real infrastructure smoke:
- Postgres healthy
- Redis healthy
- all migrations applied
- vector extension present
- 73 public tables
- worker connected to Postgres + Redis
- real outbox record published to Redis stream
- outbox record marked PROCESSED on first attempt
- API health returned database ok
- Automation Redis consumer group created
- zero pending events
- scheduler enabled successfully
- AI WhatsApp consumer remained disabled when configured false

## Final quality gate

Passed:
- TypeScript — API / web / worker
- lint — 0 warnings / 0 errors
- unit tests — 5/5
- end-to-end tests — 8/8
- API production build
- worker production build
- Next.js production build
- dependency audit — 0 vulnerabilities
- real PostgreSQL/pgvector migration smoke
- real Redis/outbox worker smoke
- real API + Automation consumer startup smoke

## External activation still intentionally separate

The following are provider-production tasks, not Phase 5 code gaps:
- live Meta App Review / Advanced Access
- live client Embedded Signup
- live WABA and phone registration
- production Meta credentials / secret manager
- live OpenAI API credentials
- OpenAI Partner Network enrollment
- production deployment infrastructure

## Phase 5 result

The generic Business OS foundation is now integrated across:

```
CRM
+ Meta WhatsApp
+ Governed AI
+ AI WhatsApp Client Handling
+ Durable Automation
```

The next product-development phase can proceed to the first industry extension without changing the generic core.
