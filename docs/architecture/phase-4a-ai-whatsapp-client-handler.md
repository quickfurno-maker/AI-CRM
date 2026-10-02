# Phase 4A — AI WhatsApp Client Handling Extension

## Status

Implementation complete on branch `feat/phase-4a-ai-whatsapp-handler`.

This phase turns the governed AI foundation into a tenant-configurable WhatsApp client handling service.

```
Meta WhatsApp inbound
→ signed webhook
→ tenant/channel router
→ conversation + CRM
→ outbox
→ Redis event stream
→ AI WhatsApp consumer group
→ governed AI runtime
→ AI Assist draft OR autonomous reply
→ Meta Cloud API
```

The client-facing provider remains our Business OS. Client WABA/phone assets remain client-owned.

---

## Commercial entitlement

The extension is gated by:

`ai.whatsapp_client_handler`

A WhatsApp channel cannot enable AI handling unless:
- the add-on entitlement is enabled
- the WhatsApp channel is CONNECTED
- the selected AI agent is ACTIVE

This keeps the extension commercially separable from basic WhatsApp inbox/campaign functionality.

---

## Runtime modes

### HUMAN

No automatic AI handling.

### AI_ASSIST

Inbound message:
- creates an AI WhatsApp job
- runs governed AI
- creates a human-reviewable suggestion
- does not send automatically

Human can send the draft through the normal WhatsApp send policy.

### AI

Inbound message:
- runs governed AI
- can auto-send only if `autoReplyEnabled=true`
- still requires an active Meta service window for free-form text
- still requires a connected channel
- remains idempotent per AI run

A user-set conversation handling mode overrides the binding default.

---

## Tables

### ai_whatsapp_bindings

One per WhatsApp ChannelAccount.

Stores:
- organization/workspace
- channel
- AI agent
- optional operator
- enabled
- default handling mode
- context message count
- autonomous reply permission
- config

### ai_whatsapp_jobs

Durable, idempotent processing state per inbound message.

Stores:
- binding
- conversation
- inbound message
- AI run
- outbound message
- attempts
- status
- processing timestamps
- errors
- metadata

The inbound message is unique, preventing duplicate AI processing from at-least-once event delivery.

### ai_whatsapp_suggestions

Human-reviewable AI Assist output.

Stores:
- job
- conversation
- inbound message
- run
- agent
- content
- status
- sent message link

---

## Durable event consumer

`AiWhatsappConsumerService` consumes the platform Redis event stream.

Configuration:

```
EVENT_STREAM=crm-ai:events
AI_WHATSAPP_EVENT_CONSUMER_ENABLED=true
AI_WHATSAPP_CONSUMER_GROUP=crm-ai:ai-whatsapp
```

Behavior:
- Redis consumer group
- XREADGROUP for new events
- XAUTOCLAIM for abandoned pending messages
- only consumes `communication.message.received.v1`
- extracts canonical inbound message ID
- calls the tenant-resolving AI WhatsApp service
- XACK only after successful/terminal processing
- processing failures remain pending for safe reclaim

The consumer can be moved from the API process to dedicated worker containers later without changing event contracts.

---

## Context assembly

The AI receives:
- CRM contact identity/context
- latest CRM lead context when available
- bounded recent WhatsApp transcript
- active agent instructions
- governed tools

Customer/CRM content is explicitly marked as **untrusted data**, not privileged instructions.

The OpenAI model receives no:
- database credentials
- Meta access tokens
- OpenAI platform secrets
- arbitrary tenant selector

---

## Governed actions

Phase 4 governed tool policies remain authoritative.

If a requested tool is approval-gated:
- AI run enters WAITING_APPROVAL
- WhatsApp job enters ACTION_REQUIRED
- no blind customer-facing continuation occurs

Human handoff tool switches the conversation to HUMAN.

---

## Autonomous send guard

`CommunicationService.sendAgentText()` requires:
- tenant-scoped conversation/contact/channel
- handling mode AI
- connected WhatsApp channel
- customer inbound message inside active Meta service window
- deterministic AI-run idempotency key

Outbound message is persisted with:
- AI agent ID
- AI run ID
- provider message ID/status

It emits:
- `communication.message.sent_by_ai.v1`

and writes an `AI_AGENT` audit record.

Ambiguous provider outcomes move the AI WhatsApp job to ACTION_REQUIRED rather than blind retry.

---

## Retry / idempotency policy

AI WhatsApp jobs:
- unique per inbound message
- terminal statuses short-circuit replays
- attempts are counted
- safe retry limit is enforced
- ambiguous customer-facing send is not automatically replayed

This is deliberate because avoiding duplicate WhatsApp replies is more important than aggressive retry.

---

## Manual replay security

Operator replay endpoint:

`POST /v1/ai/whatsapp/process`

is explicitly tenant-scoped.

A user from another tenant cannot process a known message UUID from another organization; it resolves as not found/skipped.

The trusted background event consumer can process globally because tenant ownership is resolved from the persisted message record created by the signed Meta webhook path.

---

## Management API

Protected endpoints:

- `GET /v1/ai/whatsapp/bindings`
- `PUT /v1/ai/whatsapp/bindings`
- `GET /v1/ai/whatsapp/jobs`
- `GET /v1/ai/whatsapp/suggestions`
- `POST /v1/ai/whatsapp/suggestions/:id/send`
- `POST /v1/ai/whatsapp/process`

Permissions:
- `ai.whatsapp.read`
- `ai.whatsapp.manage`

---

## Client UI

Route:

`/whatsapp/ai`

Includes:
- connected WhatsApp number selector
- active AI agent selector
- HUMAN / AI_ASSIST / AI default mode
- context window size
- enable/disable AI handling
- explicit autonomous reply switch
- current bindings
- AI Assist draft queue
- send-draft action
- job history
- ACTION_REQUIRED visibility
- runtime-safety explanation

The main `/whatsapp` control center links directly to AI Client Handler.

---

## End-to-end acceptance test

The Phase 4A e2e verifies:

1. Tenant receives AI WhatsApp add-on entitlement.
2. Tenant creates and activates AI agent.
3. Tenant completes mock Meta Embedded Signup.
4. Connected number is bound to active AI agent.
5. Signed inbound WhatsApp message creates conversation/message.
6. AI_ASSIST processing creates a draft suggestion.
7. Another tenant cannot replay/process the message by UUID.
8. Human sends the AI Assist draft.
9. Binding is switched to AI + autonomous replies.
10. Conversation is explicitly put in AI mode.
11. Second signed inbound message is processed.
12. Autonomous reply is sent and persisted.
13. Other tenant cannot see bindings.
14. Jobs resolve as completed and idempotent.

---

## Quality gate

Passed:
- TypeScript: API/web/worker
- zero-warning lint
- unit tests
- all 5 end-to-end scenarios
- API production build
- worker production build
- Next.js production build including `/whatsapp/ai`
- production dependency audit

Production dependency audit: **0 vulnerabilities**.

---

## Real production activation pending

Requires real provider configuration rather than more architecture work:

### Meta
- real App Review / Advanced Access
- real Embedded Signup
- production WABA/phone
- public HTTPS webhook
- real delivery/status verification

### OpenAI
- production OpenAI API project/key
- live model smoke tests
- production usage/cost thresholds
- eval baseline
- latency/error dashboards

### Runtime
- enable AI WhatsApp consumer in the target environment
- Redis availability/retention policy
- horizontal consumer deployment
- alerting for ACTION_REQUIRED / dead pending events

---

## Next phase

**Phase 5 — Automation Engine**

The AI WhatsApp extension will connect to:
- delays/waits
- follow-up journeys
- nurture
- approval nodes
- scheduled actions
- event triggers
- cross-channel workflows
- versioned automation runs

The automation canvas remains a control plane; durable coded services remain the runtime.
