# Phase 10D — Staff & Product Seat Foundation

Status: **implementation branch / certification pending**

Branch: `feat/phase-10d-staff-seat-foundation`

## Locked commercial rule

A staff/employee record is **not** a paid SaaS seat.

The platform separates four concepts:

1. **Staff profile** — a person in the tenant workforce.
2. **Organization membership** — an optional login identity inside the tenant.
3. **Role + resource scope** — what the logged-in identity is authorized to do.
4. **Product seat assignment** — the commercial access class that permits a human login to use the SaaS.

Creating a staff profile must never silently create a paid seat.

AI agents, automations, API credentials and integrations are not human seats.

## Access classes

- `FULL`
- `LIGHT`
- `ATTENDANCE_ONLY`
- `GUEST`

Phase 10D establishes the access/entitlement model. Phase 11 owns pricing, checkout, proration and invoice consequences.

## Data model

### staff_profiles

Core tenant workforce directory. It stores organization/workspace/branch placement, optional membership link, reporting manager, employee code, contact details, designation, department and employment lifecycle.

Important constraints:

- employee code unique per organization
- at most one staff profile per organization membership
- membership is optional
- staff existence is independent from seat existence

### member_seat_assignments

Explicit commercial access assignment for an organization membership.

Tracks:

- access class
- active/revoked state
- assigning/revoking member
- timestamps
- metadata

One membership has at most one current seat-assignment record.

## Entitlements

Starter/bootstrap now carries:

- `staff.records.max = unlimited`
- `seats.full.max = 5`
- `seats.light.max = 0`
- `seats.attendance.max = unlimited`
- `seats.guest.max = unlimited`

Legacy `users.max = 5` remains temporarily for compatibility. FULL-seat evaluation falls back to `users.max` if the new entitlement is absent.

A staff-record entitlement may cap directory size operationally, but staff creation is not usage billing.

## Runtime enforcement

Human session authentication requires an **ACTIVE** seat assignment.

This applies to:

- password login
- refresh-token rotation
- access-token/session validation
- federated/SSO session creation

Seat revocation also revokes active sessions for that membership. This prevents old sessions from becoming usable again if a seat is later reassigned.

The organization owner:

- receives a `FULL` seat at tenant registration
- cannot have the seat revoked
- cannot be downgraded from `FULL`

Role and resource-scope authorization remains separate from the commercial seat concept.

## Attendance compatibility

Phase 7 Attendance remains backward compatible.

The new migration:

1. creates the core staff directory and seat-assignment tables;
2. backfills existing Attendance employees into `staff_profiles`;
3. links existing `attendance_employees.staff_profile_id` to the corresponding core staff profile;
4. backfills every existing ACTIVE organization member with a `FULL` seat so deployment does not remove existing user access;
5. initializes the new staff/seat entitlements for existing organizations.

Forward behavior:

- creating an Attendance employee reuses a linked staff profile by explicit `staffProfileId`, organization membership, or employee code;
- if no core profile exists, Attendance creates one;
- Attendance updates synchronize shared identity/employment fields back to the linked core staff profile;
- enabling Attendance never assigns a paid seat.

The Attendance extension keeps its own operational employee record because shifts, policies, punches, leave and reconciliation remain extension-specific.

## API surface

### Staff

- `GET /v1/staff/profiles`
- `POST /v1/staff/profiles`
- `PATCH /v1/staff/profiles/:id`

### Members and seats

- `GET /v1/staff/members/directory`
- `GET /v1/staff/seats`
- `GET /v1/staff/seats/summary`
- `PUT /v1/staff/members/:id/seat`
- `DELETE /v1/staff/members/:id/seat`

## UI

Route: `/staff`

The Staff & Access interface separates:

- staff directory
- login state
- seat state
- seat class
- seat usage and limits

The staff creation CTA explicitly states that creating the staff profile does not create a paid seat.

## Migration

Migration: `0013_staff_seat_foundation.sql`

Expected schema after migration: **117 public tables**.

## Certification requirements

The Phase 10D staff/seat slice is certified only when CI confirms:

- TypeScript checks
- lint
- unit tests
- full foundation e2e suite
- production builds
- production dependency audit

The e2e scenario specifically verifies:

- new tenant owner starts with one FULL seat
- creating staff does not change FULL-seat usage
- Attendance reuses the same core staff profile
- owner seat cannot be revoked
- a membership without a seat cannot log in
- ATTENDANCE_ONLY does not consume FULL quota
- FULL-seat limit is enforced
- seat revocation invalidates access and refresh sessions
- staff record remains after seat operations
- staff/seat audit events are written

## Phase 11 boundary

This phase does **not** charge a payment method or calculate money.

Phase 11 will map these explicit seat assignments to:

- included plan seats
- additional-seat purchases
- upgrades/downgrades
- effective dates
- proration
- renewals
- SaaS invoices
- dunning
- subscription portal

The canonical principle remains: **headcount is not billable seat count.**
