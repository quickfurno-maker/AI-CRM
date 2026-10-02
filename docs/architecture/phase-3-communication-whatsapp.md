# Phase 3 — Communication + WhatsApp + Meta Partner Foundation

## Status

Implementation checkpoint complete on branch `feat/phase-3-communication-whatsapp`.

This phase implements the platform-side WhatsApp foundation around the locked provider model:

```
Client
→ Our Business OS
→ Meta Embedded Signup
→ Client-owned WABA + phone
→ Our Tech Provider / Tech Partner integration
→ Unified Inbox / Templates / Campaigns
```

Real Meta production activation remains a credential/App Review task.

---

## Schema

Phase 3 expands the database to 49 tables.

Communication domains include:
- Meta Business Connections
- Channel Accounts
- Conversations
- Conversation Participants
- Messages
- Message Attachments
- Message Status Events
- Communication Consents
- Message Templates
- Campaigns
- Campaign Recipients
- Webhook Events

The generated migration is:

`apps/api/drizzle/0002_unique_timeslip.sql`

---

## Meta Business Connection

`MetaBusinessConnection` represents the tenant's delegated relationship with a client Meta Business Portfolio / WABA.

It stores:
- tenant/workspace
- Embedded Signup state
- WABA ID
- Business Portfolio ID
- system-user/delegated-access state
- partner role
- client-owned-asset invariant
- billing mode
- app subscription status
- connection/sync/disconnect timestamps
- managed credential reference

One Meta Business Connection can own multiple WhatsApp Channel Accounts.

---

## Embedded Signup

The client-facing onboarding flow is:

```
Business OS
→ Connect WhatsApp
→ Meta Embedded Signup
→ client selects/creates Business Portfolio
→ client selects/creates WABA
→ client selects/adds phone
→ backend completes partner connection
→ assign delegated/system-user access
→ subscribe our app to WABA
→ register phone with two-step PIN
→ create tenant channel mapping
→ activate WhatsApp services
```

Manual channel/token configuration remains development/migration fallback only.

Credentials are never returned to browser clients.

---

## Webhook gateway

Public endpoint:

`/v1/webhooks/meta/whatsapp`

Implemented:
- GET verification challenge
- raw-body HMAC-SHA256 verification
- payload hashing
- idempotent webhook storage
- Phone Number ID routing
- WABA fallback routing for account/template events
- tenant fail-closed behavior
- retry/error state
- delivery/read/failure processing
- template provider-state processing
- phone quality/name event capture

A single webhook payload cannot cross tenant boundaries.

---

## Inbound conversation flow

```
Signed Meta webhook
→ tenant/channel resolution
→ WhatsApp identity normalization
→ CRM contact resolve/create
→ conversation resolve/create
→ message persist
→ media metadata persist
→ unread count update
→ outbox event
```

Unknown WhatsApp senders become tenant-scoped CRM Contacts with source `WHATSAPP`.

Conversation handling modes:
- HUMAN
- AI_ASSIST
- AI

AI mode is only a state hook in Phase 3; autonomous AI behavior belongs to Phase 4/4A.

---

## Consent and STOP

Communication consent is modeled independently from CRM.

Inbound stop commands such as:
- STOP
- STOP ALL
- UNSUBSCRIBE
- CANCEL
- END
- QUIT

automatically revoke WhatsApp marketing consent.

The change writes:
- consent ledger state
- audit/event state

Campaign and template sending re-check consent at execution time.

---

## Outbound messaging

### Free-form text

Server enforces the active Meta customer-service window.

Outside the allowed service window, free-form messages are rejected and an approved template is required.

### Templates

The platform supports:
- local template drafts
- tenant/channel binding
- Meta sync
- provider template ID
- language/category
- approval status
- quality state
- provider-state webhooks
- template sends

Marketing template sends require explicit GRANTED marketing consent.

---

## Campaign foundation

Campaigns can be:
- DRAFT
- SCHEDULED
- QUEUED
- RUNNING
- COMPLETED
- COMPLETED_WITH_ERRORS
- ACTION_REQUIRED

Campaign recipient jobs are durable database work items.

The worker:
- claims recipient rows with `FOR UPDATE SKIP LOCKED`
- increments attempts
- re-checks consent immediately before send
- validates channel connectivity
- blocks unresolved template variables
- sends through Meta transport
- creates/updates conversation
- persists outbound message
- links recipient to message
- emits outbox event
- reconciles campaign state

Ambiguous provider/network results are not blindly retried.

They become `UNKNOWN` / campaign `ACTION_REQUIRED` so we do not risk duplicate customer sends.

Stale processing claims are recovered conservatively.

---

## Unified Inbox API

Protected API supports:
- list conversations
- conversation detail
- message history
- read state
- assignment
- status
- HUMAN / AI_ASSIST / AI mode
- free-form text send
- template send

Every query is tenant-scoped from the authenticated principal.

---

## WhatsApp Control Center UI

Route:

`/whatsapp`

Includes:
- Meta Partner connection settings
- Connect WhatsApp / Embedded Signup launcher
- WABA connection state
- phone registration PIN step
- connected phone-number list
- Unified Inbox
- message history
- text reply
- HUMAN / AI_ASSIST / AI selector
- Template Studio
- Meta template sync
- campaign draft/schedule UI

Browser communication goes through a secure Next.js BFF:

`/api/communication/[...path]`

Access/refresh tokens stay in HttpOnly cookies.

---

## Provider transport modes

### disabled
No provider calls.

### mock
Used for deterministic e2e testing.

### live
Uses Meta Cloud API with:
- configurable Graph version
- managed secret references
- WABA/phone IDs resolved from tenant connection
- platform-managed credentials

Production forbids mock transport.

---

## Permissions

Added:
- communication.inbox.read
- communication.message.send
- communication.conversation.manage
- communication.channel.manage
- communication.template.manage
- communication.consent.manage
- communication.campaign.manage

Owner roles inherit new permissions through the existing permission bootstrap.

---

## End-to-end test gate

The Meta/WhatsApp e2e verifies:

1. Tenant begins Embedded Signup.
2. Meta connection is completed in mock mode.
3. Tenant WABA + phone mapping is created.
4. Signed inbound webhook is accepted.
5. Invalid/cross-tenant paths remain isolated.
6. Unknown WhatsApp identity becomes CRM contact.
7. Conversation and inbound message are created.
8. Free-form outbound reply is sent during service window.
9. Local template is created.
10. Marketing consent is granted.
11. Template send succeeds.
12. Template approval webhook updates provider state.
13. Campaign is created and queued.
14. STOP webhook revokes marketing consent.
15. Subsequent marketing template send is rejected.
16. Meta read-status webhook updates outbound message to READ.

---

## Full quality gate

Passed:
- TypeScript: web/API/worker
- API lint
- worker lint
- React/Next lint
- unit tests
- multi-tenant + CRM + Meta/WhatsApp e2e
- API production build
- worker production build
- Next.js production build
- production dependency audit

Production dependency audit: **0 vulnerabilities**.

---

## Deliberately pending for real Meta activation

These need real account/app credentials and Meta approval, not more mock architecture:

- real Meta App ID/config ID
- App Secret / verify token
- system-user access token or production secret-manager equivalent
- Business Management Advanced Access
- `whatsapp_business_management`
- `whatsapp_business_messaging`
- `business_management` where onboarding flows require it
- Meta App Review
- real Embedded Signup tenant
- live WABA discovery/access verification
- real phone registration
- public HTTPS webhook URL
- real template sync/send
- live campaign smoke test
- disconnect/revoke validation against Meta

---

## Next phase

**Phase 4 — AI Foundation**

Build:
- AI Gateway
- OpenAI provider adapter
- Responses API
- agent definitions + versions
- governed tool registry
- policy/approval gateway
- knowledge/RAG foundation
- model routing
- usage/cost metering
- tracing/evals

Then:

**Phase 4A — AI WhatsApp Client Handling Extension**
