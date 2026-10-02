# Phase 2 — Core CRM

## Status

Implementation checkpoint complete on branch `feat/phase-2-core-crm`.

## Database

Phase 2 adds 17 CRM tables, taking the schema from 20 to 37 tables.

Core objects:
- Contacts
- Companies
- Contact ↔ Company relationships
- Pipelines
- Pipeline stages
- Leads
- Deals
- Tasks
- Appointments
- Activities
- Notes
- Tags
- Object tags
- Custom-field definitions
- Custom-field values
- Saved lists / segments
- Saved-list members

Migration: `apps/api/drizzle/0001_dizzy_eternity.sql`.

Every tenant-owned CRM table carries `organization_id`; workspace and owner membership are included where operationally relevant.

## Pipeline model

Each workspace gets deterministic default pipelines.

### Lead Qualification
1. New
2. Contacted
3. Qualified
4. Unqualified

### Deal Sales Pipeline
1. New
2. Discovery
3. Proposal
4. Negotiation
5. Won
6. Lost

Stage transitions update canonical state rather than relying on the browser:
- Qualified lead stage → `QUALIFIED`
- Unqualified/lost lead stage → corresponding lead status
- Won deal → `WON`, 100% probability and close timestamp
- Lost deal → `LOST` and close timestamp

## Tenant isolation

All reads and writes are scoped from the authenticated organization principal.

Linked IDs are revalidated against the current organization before writes:
- Contact
- Company
- Lead
- Deal
- Pipeline stage
- Owner/member
- Workspace

A valid UUID from another tenant is treated as not found and cannot be linked.

## Transactional mutation pattern

Business mutations use a single PostgreSQL transaction for:
1. CRM record mutation
2. Outbox event
3. Audit record

Examples:
- `crm.contact.created.v1`
- `crm.company.created.v1`
- `crm.contact_company.linked.v1`
- `crm.lead.created.v1`
- `crm.lead.stage_changed.v1`
- `crm.deal.created.v1`
- `crm.deal.stage_changed.v1`
- `crm.task.created.v1`
- `crm.appointment.created.v1`
- `crm.activity.created.v1`
- `crm.note.created.v1`

## Permissions

CRM permissions are first-class RBAC capabilities:
- contact read/create/update/delete
- company read/create/update/delete
- lead read/create/update/delete
- deal read/create/update/delete
- pipeline read/manage
- task read/create/update
- appointment read/create/update
- activity read/create
- note read/create
- tag manage
- custom-field manage
- saved-list manage

New permissions are automatically backfilled to system Owner roles.

### Scope safety

Organization-wide scope is operational now.

Narrower scopes (`OWN`, `TEAM`, `BRANCH`, `WORKSPACE`) intentionally fail closed until the repository-level filters for those scopes are implemented. This prevents a role marked OWN from accidentally receiving tenant-wide records.

## CRM API

All routes sit under `/v1/crm`.

Operational surfaces:
- Contacts and Companies
- Contact ↔ Company relationships
- Lead and Deal pipelines
- Tasks
- Appointments
- Activities / timeline
- Notes
- Tags
- Custom fields and values
- Saved lists / segments

All routes are protected by global authentication plus explicit CRM permissions.

## Web application

The browser uses a catch-all Next.js BFF route:
`/api/crm/[...path]`

The BFF:
- reads HttpOnly session cookies
- never exposes raw access/refresh tokens to browser JavaScript
- proxies only to the backend CRM namespace
- retries once after access-token refresh
- rotates cookies after refresh
- clears cookies on persistent 401

The `/crm` workspace provides:
- KPI cards
- Contacts
- Companies
- Lead quick-create
- Lead Kanban with drag/drop stage movement
- Deal quick-create
- Deal Kanban with drag/drop stage movement
- Tasks
- Appointments
- Activity timeline
- INR value display

The main Command Center links directly to the CRM workspace.

## Validation gate

Passed:
- TypeScript across web/API/worker
- API and worker lint
- React/Next lint
- unit tests
- multi-tenant e2e
- CRM workflow e2e
- production builds
- production dependency security audit

CRM e2e verifies:
1. Tenant C creates a contact.
2. Tenant D cannot read it.
3. Tenant D cannot create a lead referencing Tenant C's contact.
4. Contact ↔ Company linking works inside the tenant.
5. Lead creation assigns the default pipeline.
6. Moving the lead to Qualified updates canonical status.
7. Deal creation links safely to the lead/contact.
8. Moving the deal to Won sets WON + 100% probability.
9. Task creation linked to the deal succeeds.

Production dependency audit: 0 vulnerabilities.

## Deferred deliberately

These are not Phase 2 blockers:
- user invitation/team administration UI
- repository filtering for OWN/TEAM/BRANCH/WORKSPACE scopes
- advanced custom-field configuration UI
- advanced saved-list builder UI
- bulk import/export
- lead scoring model beyond the stored scoring foundation
- communication/WhatsApp inbox

Those belong to later phases or cross-cutting maturity work.

## Next phase

**Phase 3 — Communication + WhatsApp**

Target:
Meta webhook gateway → WhatsApp adapter → unified conversation store → CRM identity linking → consent → templates → delivery/read states → team inbox → human takeover → campaign foundation → durable retry/idempotency.
