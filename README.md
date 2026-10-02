# CRM-AI Business OS

Scalable multi-tenant SaaS foundation for CRM, WhatsApp, AI agents, automation, attendance, billing, analytics, and industry extensions.

## Current build phase

**Build Phase 1 — SaaS Foundation**

Implemented:
- npm workspaces + Turborepo monorepo
- Next.js 16 web app
- NestJS 12 API
- independent worker process
- PostgreSQL + Drizzle schema and migrations
- Redis-backed event stream worker design
- organizations, memberships, workspaces, branches, teams
- RBAC permissions and scoped tenant principal
- JWT access sessions + rotating refresh tokens
- Starter subscription + entitlement provisioning
- feature flags
- audit logs
- transactional outbox
- platform-admin boundary
- health endpoint
- secure Next.js BFF auth cookies
- tenant-isolation end-to-end test
- CI quality gates

## Repository

```
apps/
  web/       Next.js application
  api/       NestJS application + Drizzle schema
  worker/    outbox/event worker
docs/
  architecture/
.github/
  workflows/
```

## Local prerequisites

- Node.js 24+
- npm 11+
- Docker Desktop for local PostgreSQL + Redis
- Git

## Local setup

```powershell
cd "C:\Users\KESHAV SHARMA\Desktop\CRM-AI"
Copy-Item .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run dev:api
```

In another terminal:

```powershell
npm run dev:web
```

And for event processing:

```powershell
npm run dev:worker
```

Web: http://localhost:3000  
API: http://localhost:4000/v1  
Health: http://localhost:4000/v1/health

## Quality gates

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

## Architecture rule

A browser-supplied tenant identifier is never authoritative. Tenant context is resolved from the authenticated organization membership/session and must be enforced again by every tenant-owned repository/query.

## Next phase

**Build Phase 2 — Core CRM**

Contacts → Companies → Leads → Pipelines → Deals → Tasks → Activities → Appointments → Notes → Tags → Custom Fields → Lists/Segments.
