# Final Platform Hardening

## Status

This release closes the final repository-side product hardening identified by the end-to-end audit. It does not activate third-party production accounts or perform the final AWS/Cloudflare deployment.

## Scope-aware global search

The authenticated command palette now searches both:
- product destinations; and
- tenant-owned CRM records.

Backend endpoint:
`GET /v1/platform/search?q=...&limit=...`

Search currently covers contacts, companies, leads and deals.

Important security property:
- organization identity comes from the authenticated principal;
- CRM resource scope is resolved through the canonical CRM scope service;
- rows outside the caller's OWN / TEAM / BRANCH / WORKSPACE / ORGANIZATION scope are removed before results are returned.

## Evidence-driven onboarding

Endpoint:
`GET /v1/platform/onboarding`

The Command Center setup card is derived from real tenant state. Required steps are not manually toggleable.

Current evidence includes:
- tenant/workspace exists;
- another team member exists;
- CRM has at least one contact;
- SaaS billing profile exists.

Optional activation evidence includes:
- connected WhatsApp channel;
- active AI agent;
- active automation.

Onboarding can be dismissed/reopened without falsifying completion.

## Notification center

`tenant_notifications` stores tenant/membership-scoped operational notifications with:
- category;
- severity;
- title/body;
- action destination;
- unread/read state;
- dedupe key.

The application shell exposes unread count, individual read state, mark-all-read and deep linking.

The worker materializes failed/action-required/reconciliation-required outbox events into notifications idempotently.

## Support Center

Tenant:
- create ticket;
- category and priority;
- tenant-isolated list/detail;
- customer replies;
- provider-visible status.

Provider:
- global support queue for platform admins;
- status and priority control;
- customer-visible provider replies;
- internal provider notes;
- complete ticket conversation.

Tenant routes never disclose provider internal notes.

## Data governance

Tenant Governance Center supports:
- audit retention;
- notification retention;
- support retention;
- AI trace retention;
- erasure grace period;
- legal hold;
- export request;
- erasure request;
- SHA-256 audit evidence export.

Legal hold is authoritative:
- erasure requests cannot be created/approved under legal hold;
- retention cleanup is suppressed while legal hold is active.

Approved erasure is intentionally not auto-destructive. After the configured grace period the worker changes the request to `ACTION_REQUIRED` and emits a governed operator event. Destructive tenant deletion therefore remains an explicit controlled operation.

## Retention worker

The worker applies:
- old audit-log removal;
- old read/archived notification removal;
- old closed support-ticket removal;
- AI run/tool payload minimization;
- governed erasure escalation.

All retention operations are tenant-policy driven and legal-hold aware.

## Distributed rate limiting

Rate limiting is global and Redis-backed with a bounded in-memory fallback.

Default request budgets:
- public: 120/minute;
- auth general: 20/minute;
- register: 5/minute/IP;
- login: 10/minute/IP;
- refresh: 30/minute/IP;
- authenticated session: 600/minute/identity;
- API key/OAuth: 300/minute/identity;
- webhooks: 1200/minute/IP.

Responses expose limit/remaining/store headers. Rejected requests include `Retry-After`.

The foundation E2E suite explicitly disables request budgets because it creates many isolated tenants from a single in-process test client. A dedicated rate-limit unit test certifies enforcement separately; production protection is unchanged.

## Reverse-proxy trust boundary

`TRUST_PROXY_HOPS` is explicit and defaults to `1`.

Production rule:
- direct trusted ALB -> ECS: keep `1`;
- Cloudflare -> ALB -> ECS: only set `2` after ALB ingress is restricted so clients cannot bypass Cloudflare and spoof forwarded addresses.

Terraform exposes the hop count and all request-budget settings.

## Health contracts

Public:
- `GET /v1/health/live` — process liveness only;
- `GET /v1/health/ready` — database + Redis readiness;
- `GET /v1/health` — compatibility readiness endpoint.

Platform-admin only:
- `GET /v1/health/runtime` — transport modes, consumers, rate-limit health, outbox state and process memory.

The ALB target group uses `/v1/health/ready`.

## PWA / mobile hardening

The web application now includes:
- manifest;
- standalone display metadata;
- theme/mobile viewport metadata;
- safe-area support;
- application icon;
- service-worker registration in production;
- safe offline route.

The service worker deliberately does **not** cache authenticated business pages/data. Only static application assets are cache-assisted; navigation remains network-first and falls back to the offline page.

## Audit evidence

`GET /v1/audit/export` returns:
- tenant-scoped audit records;
- generation timestamp;
- record count;
- SHA-256 integrity digest.

It is an evidence export, not an external compliance certification.

## Database

Migration `0016_final_platform_hardening.sql` adds:
- `tenant_onboarding_states`
- `tenant_notifications`
- `support_tickets`
- `support_ticket_comments`
- `data_governance_policies`
- `data_governance_requests`

Certified schema after this migration: **147 public tables**.

## Certification

CI requires:
- TypeScript;
- lint;
- premium UI quality gate;
- unit tests;
- foundation E2E;
- production build;
- production dependency audit;
- real PostgreSQL migration + idempotence;
- 147-table schema verification;
- pgvector verification;
- Terraform validation;
- API/web/worker/migration container builds;
- migration-image production audit.

The E2E suite additionally certifies:
- cross-tenant search isolation;
- onboarding evidence transition;
- support ticket isolation and comments;
- governance policy and export manifest;
- notification read lifecycle;
- SHA-256 audit evidence.

## External-only work

Still intentionally outside this repository completion:
- production AWS/Cloudflare apply and DNS;
- Cloudflare/ALB ingress topology selection + final `TRUST_PROXY_HOPS`;
- restore/rollback incident drills on real infrastructure;
- Meta App Review/Advanced Access and live WABA;
- OpenAI production key and live Responses/embeddings/RAG drills;
- Razorpay merchant credentials/webhook registration and real-money certification;
- invitation/commercial email provider;
- real alert receivers;
- final production-domain sitemap/canonical URLs/analytics tags.
