# CRM-AI Business OS

Industry-neutral, multi-tenant SaaS for CRM, WhatsApp, governed AI agents, automation, workforce operations, customer business billing, analytics, developer integrations, Real Estate workflows and SaaS commercial operations.

## Current status

**Internal product implementation through Phase 11 is complete and merged to `main`.**

Major internal release merges:
- Phase 10/11 foundation + commercial maturity: **PR #2**
- Premium UI/UX + flagship public SaaS website: **PR #4**
- Complete SaaS payment gateway runtime: **PR #5**
- Final platform hardening (search/onboarding/support/governance/resilience): **PR #6**

Current runtime baseline:
`fb541c0c785dea3a65a89a70a3b7e072a9a80427`

This baseline includes the hardened production migration image, premium product/public-site release, and the internally complete SaaS payment-gateway runtime. Payment live mode remains disabled by default until production Razorpay merchant credentials and webhook registration are intentionally activated.

CI certification:
- TypeScript: API / web / worker — PASS
- lint — PASS
- unit tests — PASS
- full foundation e2e — PASS
- production builds — PASS
- production dependency audit — PASS
- real PostgreSQL migrations — PASS
- migration idempotence — PASS
- PostgreSQL schema verification — **147 public tables**
- pgvector verification — PASS
- Terraform validation — PASS
- API/web/worker/migration container builds — PASS

The remaining launch blockers are **external activation tasks**, not unfinished core-code phases:
- production AWS + Cloudflare account deployment and restore drill
- Meta App Review / Advanced Access / real WABA onboarding
- production OpenAI credentials and live AI/embedding validation
- live Razorpay merchant credentials, webhook registration and real-money payment/refund certification
- production invitation-email provider
- production alert receivers and real incident/rollback exercise

## Product boundaries

Two billing domains are intentionally separate:

1. **Customer Business Billing** — invoices, quotes, receipts and payments a tenant issues to its own customers.
2. **SaaS Commercial Billing** — plans, subscriptions, add-ons, usage, SaaS invoices/receipts and dunning for what the tenant buys from us.

Staff records are also separate from paid product access:
- creating an employee/staff record is not billable by itself;
- a paid human seat exists only when an explicit product seat/access class is assigned;
- supported classes include `FULL`, `LIGHT`, `ATTENDANCE_ONLY` and `GUEST`;
- AI agents, automations and API credentials never consume human seats.

## Architecture

- Next.js + TypeScript web application
- NestJS + TypeScript API
- PostgreSQL source of truth
- Redis-backed event processing
- pgvector for tenant knowledge/RAG
- transactional outbox + strict idempotency
- event-driven modular monolith with independent workers
- provider-independent AI Gateway; OpenAI is the primary production AI provider
- Meta WhatsApp Business Platform through client-owned assets and delegated access
- centralized RBAC, resource scope, entitlements and usage metering
- Cloudflare + AWS ECS/Fargate production target
- Terraform/OpenTofu-compatible infrastructure definitions
- migration-first production deployment with ECS rollback circuit breakers

## Completed build phases

| Phase | Status | Scope |
|---|---|---|
| 1 | ✅ | Multi-tenant SaaS foundation |
| 2 | ✅ | Core CRM |
| 3 | ✅ | Meta + WhatsApp platform |
| 4 | ✅ | Governed AI foundation |
| 4A | ✅ | AI WhatsApp client-handler foundation |
| 5 | ✅ | Automation engine |
| 6 | ✅ | Real Estate extension |
| 7 | ✅ | Attendance + employee operations |
| 8 | ✅ | Customer business billing + advanced analytics |
| 9 | ✅ | Developer platform + marketplace + enterprise foundation |
| 10A | ✅ internal | Production infrastructure-as-code, containers, migration-first deploy, alerts |
| 10B | ⏳ external activation | Live Meta / WhatsApp |
| 10C | ⏳ external activation | Production OpenAI WhatsApp Agent |
| 10D | ✅ | CRM/staff/team/resource-scope commercial maturity |
| 10E | ✅ | Complete governed Real Estate AI toolset |
| 10F | ✅ repo certification | Documentation + internal launch certification |
| 11 | ✅ internal | SaaS plans, subscriptions, add-ons, usage, invoices, payment gateway runtime, portal, dunning |
| 12 | 🟡 demand-triggered | Enterprise maturity / deployment options |

## Key application surfaces

Public website:
- `/` — flagship SaaS homepage
- `/platform` — complete product capability overview
- `/pricing` — live SaaS catalog + commercial model
- `/security` — tenant isolation, AI governance and production security

Tenant:
- `/dashboard` — command center
- `/crm` — CRM
- `/whatsapp` — inbox, templates, campaigns
- `/ai-agents` — governed AI
- `/automations` — workflow control
- `/real-estate` — Real Estate extension
- `/attendance` — employee operations
- `/billing` — customer business billing
- `/analytics` — analytics
- `/staff` — staff directory + product seats
- `/team` — invitations, roles, teams and access
- `/subscription` — SaaS plan, add-ons, usage, invoices and receipts
- `/support` — tenant support center
- `/governance` — retention, audit evidence and data requests
- `/developer` — API keys / OAuth / webhooks
- `/marketplace` — extensions
- `/enterprise` — enterprise controls

Provider:
- `/provider`
- `/provider/marketplace`
- `/provider/commercial`
- `/provider/experience` — support and governance review

## Real Estate AI tools

The governed AI tool registry includes:
- `search_properties()`
- `recommend_properties()`
- `compare_properties()`
- `create_requirement()`
- `schedule_site_visit()`
- `send_property()`
- `follow_up_buyer()`
- `create_booking()`

`create_booking()` is L3 and approval-gated. Customer communication tools inherit WhatsApp policy/service-window enforcement.

## Local development

Prerequisites:
- Node.js 24+
- npm 11+
- Docker Desktop
- Git

```powershell
cd "C:\Users\KESHAV SHARMA\Desktop\CRM-AI"
Copy-Item .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run dev:api
```

In separate terminals:

```powershell
npm run dev:web
npm run dev:worker
```

Web: http://localhost:3000  
API: http://localhost:4000/v1  
Health: http://localhost:4000/v1/health

## Quality gates

```powershell
npm run typecheck
npm run lint
npm run ui:quality
npm test
npm run test:e2e
npm run build
npm audit --omit=dev --audit-level=high
```

CI also verifies:
- premium UI/public-site/platform-experience regression requirements
- migration execution and idempotence against PostgreSQL + pgvector
- expected production schema
- Terraform syntax/provider validation
- production container builds

## Production deployment

Production definitions live under:
- `infra/terraform/`
- `.github/workflows/deploy-production.yml`

The release sequence is intentionally:

```text
build immutable images
        ↓
apply infrastructure
        ↓
run migration task
        ↓
abort on migration failure
        ↓
update API / web / worker task definitions
        ↓
wait for ECS stability
        ↓
health verification
```

Keep Meta and AI transport modes disabled until their live-provider certification gates are intentionally executed.

See:
- `docs/architecture/phase-10-production-readiness.md`
- `docs/architecture/phase-11-saas-commercial-operations.md`
- `docs/architecture/payment-gateway-runtime.md`
- `docs/architecture/production-launch-runbook.md`
- `docs/architecture/premium-ui-public-site.md`
- `docs/architecture/final-platform-hardening.md`

## Non-negotiable security rule

A browser-supplied tenant identifier is never authoritative. Tenant identity and resource scope are derived from authenticated server-side context and enforced again by tenant-owned queries/services.

AI never receives unrestricted database access. The model proposes tool calls; platform code performs permission, tenant, scope, risk, approval and policy checks before deterministic execution.
