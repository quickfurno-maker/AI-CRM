# Phase 1 — SaaS Foundation

## Status

Implementation checkpoint complete on branch `feat/phase-1-saas-foundation`.

## Foundation invariants

- Tenant identity comes from the authenticated session, never from a browser-supplied tenant ID.
- Every organization-owned table carries an organization identifier where applicable.
- Authorization is enforced server-side through global authentication and permission guards.
- Access tokens are short-lived; refresh tokens are rotated and only stored hashed in PostgreSQL.
- Browser tokens are stored in HttpOnly cookies through the Next.js BFF surface.
- Subscription access is entitlement-driven rather than hard-coded by plan name.
- Critical mutations can write a transactional outbox event in the same database transaction.
- Audit records support human, system, integration, automation, and future AI actors.
- Background event publishing is independently scalable from the API.
- Production dependencies must pass the CI security audit gate.

## Implemented platform domains

- Users
- Organizations
- Organization memberships
- Workspaces
- Branches
- Teams and team membership
- Roles and permissions
- Sessions
- Plans and plan features
- Subscriptions
- Entitlements
- Feature flags
- API-key schema
- Audit logs
- Outbox events

## Runtime topology

```
Next.js web
  ↓ BFF / HttpOnly session cookies
NestJS API
  ↓
PostgreSQL
  ↓ transactional outbox
Worker
  ↓
Redis Stream
```

The event worker uses claim batches with `FOR UPDATE SKIP LOCKED`, retry state, stale-claim recovery, and terminal failed state.

## Phase 1 test gate

The end-to-end foundation test verifies:

1. Two organizations can be provisioned independently.
2. A request cannot switch tenant by providing another organization ID.
3. A tenant receives only its own organization profile.
4. Starter entitlements are provisioned for the new tenant.
5. A user cannot authenticate into an organization without membership.
6. Refresh tokens rotate.
7. Reuse of the previous refresh token is rejected.
8. Logout revokes the server-side session.
9. Revoked access tokens stop working because the server validates session state.

## Local infrastructure

`compose.yaml` provides:
- PostgreSQL 17
- Redis 8

The workstation Docker Desktop daemon was unhealthy during this checkpoint, so automated tests use a PostgreSQL-compatible in-memory harness against the generated SQL migration. The Docker Compose topology remains the intended local runtime and should be smoke-tested once Docker Desktop is healthy.

## Next phase

Phase 2 builds the universal CRM domain while preserving these boundaries:

Contacts → Companies → Leads → Pipelines → Deals → Tasks → Activities → Appointments → Notes → Tags → Custom Fields → Lists/Segments.
