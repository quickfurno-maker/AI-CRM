# Phase 7 — Attendance & Employee Operations

## Status

Phase 7 is complete and certified.

Attendance is implemented as an optional Business OS extension, not inside CRM internals. It reuses the platform's organization, workspace, branch, membership, entitlement, permission, audit and event foundations while keeping employee attendance data tenant-isolated.

Extension manifest:
- key: `attendance`
- version: `1.0.0`
- entitlement: `extension.attendance`
- tenant route: `/attendance`

Platform administrators can activate or revoke it through the existing Provider Extensions console.

## Domain model

Phase 7 adds nine tables:

1. `attendance_departments`
2. `attendance_employees`
3. `attendance_shifts`
4. `attendance_shift_assignments`
5. `attendance_policies`
6. `attendance_holidays`
7. `attendance_leave_requests`
8. `attendance_records`
9. `attendance_events`

The production schema now contains 94 application tables.

### Employees

An attendance employee may optionally link to an existing `organization_member`.

This allows:
- a normal SaaS user to use self-service check-in/out
- a manager/admin to maintain employees who do not need application logins
- attendance identity to remain separate from authentication identity

Employee records support:
- employee code
- display name
- email / phone
- designation
- employment type
- branch
- department
- manager
- joining / exit date
- active/inactive/exited status
- tenant-scoped metadata

Employee codes are unique inside an organization.

A member can be linked to at most one attendance employee inside the organization.

## Departments

Departments are tenant/workspace scoped and may optionally belong to a branch.

A department can have:
- name
- code
- manager member
- branch
- status
- metadata

Department membership is validated against the employee's selected workspace/branch.

## Shifts

Shifts support:
- name / code
- workspace / optional branch
- timezone
- start / end time
- break minutes
- grace minutes
- expected work minutes
- weekly off days
- active status

Overnight shifts are supported by calculating the end time on the following day when necessary.

Early-morning check-ins that still fall inside the previous overnight shift are attributed to the previous shift date. This prevents a 22:00–06:00 employee from creating the canonical attendance record on the wrong calendar day.

Expected work minutes are deterministic:

`shift span - configured break`

Weekly-off days are normalized and stored as numeric weekday values.

## Shift assignments

Shift assignments are effective-date based.

Each assignment contains:
- employee
- shift
- effective from
- optional effective to

Overlapping assignments for the same employee are rejected.

The overlap check is serialized per employee inside the write transaction, preventing concurrent requests from creating intersecting assignments after both independently pass a pre-insert check.

Employee and shift workspace/branch boundaries must match.

## Attendance policy

Attendance policies are workspace or branch scoped.

Configurable rules:
- default policy
- location validation mode
- geofence latitude / longitude
- radius in metres
- maximum accepted GPS accuracy in metres
- allow remote punch
- late grace minutes
- early-exit grace minutes
- maximum open shift hours
- active/inactive status

Only one active default policy can exist per workspace scope or per branch scope. Partial unique database indexes enforce this invariant under concurrency.

Location modes:
- `NONE`
- `OPTIONAL`
- `REQUIRED`

## Location privacy rule

Phase 7 does **not** implement continuous employee tracking.

Location is accepted only at the attendance event itself.

The platform stores:
- punch latitude / longitude when supplied
- reported accuracy
- validation result
- calculated distance from allowed location

The system does not poll or continuously store device location.

This keeps location validation proportional to the attendance purpose.

## Geofence behavior

For normal employee punches:

### NONE
Location is not required.

### OPTIONAL
A location can be evaluated when supplied, but absence/outside status does not block the punch.

### REQUIRED
When remote punching is disabled:
- missing coordinates are rejected
- reported GPS accuracy is required
- accuracy worse than the configured threshold is rejected
- coordinates outside the configured radius are rejected
- coordinates inside the radius with acceptable accuracy create a `VALID` attendance event

The default maximum accepted GPS accuracy is 100 metres and can be configured per policy.

Optional/remote-capable policies can retain a punch as `LOW_ACCURACY` instead of silently presenting weak GPS data as precise.

Distance is calculated deterministically with the Haversine formula.

### Manager correction

Manager/admin manual corrections intentionally do not depend on the manager device being inside the employee geofence.

Manual punch events are marked:

`locationValidation = ADMIN_OVERRIDE`

They remain fully audited and distinguishable from employee self-punches.

## Attendance event model

Punch history is append-oriented.

Event types include:
- `CHECK_IN`
- `CHECK_OUT`
- `MANUAL_IN`
- `MANUAL_OUT`

Each event records:
- tenant / workspace
- employee
- attendance record
- shift
- branch
- policy
- event timestamp
- source
- optional coordinates
- optional device accuracy
- location validation result
- distance
- actor
- idempotency key

The daily attendance record is the operational summary; events preserve the underlying history.

## Check-in authority

Self check-in requires:
1. authenticated organization membership
2. enabled Attendance entitlement
3. `attendance.self.punch`
4. an attendance employee linked to the member
5. active employee status
6. valid location when required
7. no existing check-in for that attendance date

A check-in:
- resolves the effective shift
- resolves the applicable branch/workspace policy
- calculates late minutes
- creates/updates the daily record
- appends the punch event
- writes an audit record
- emits the outbox event

All authoritative writes occur in one transaction.

Event:

`attendance.employee.checked_in.v1`

## Check-out authority

Check-out requires a real open attendance record.

The system rejects:
- check-out without prior check-in
- check-out before check-in
- duplicate closed check-out
- non-admin shifts exceeding the configured maximum open duration

Check-out calculates:
- raw elapsed duration
- break deduction
- work minutes
- early-exit minutes
- overtime minutes

Then it:
- closes the daily record
- appends the punch event
- audits the mutation
- emits the outbox event

Event:

`attendance.employee.checked_out.v1`

## Idempotency

Punch APIs accept an optional `idempotencyKey`.

A tenant-scoped unique database index protects against duplicate external/mobile retries.

If the same request is replayed:
- no second punch is created
- the original event/record is returned
- response indicates the operation was idempotent

An idempotency key is also validated against the original employee and punch action. Reusing a check-in key for another employee or for a check-out fails with HTTP 409 rather than replaying an unrelated event.

This is additionally protected against concurrent duplicate requests through the database unique constraint.

## Daily records

A daily attendance record stores:
- employee
- date
- effective shift
- status
- first check-in
- last check-out
- work minutes
- late minutes
- early-exit minutes
- overtime minutes
- source

Supported lifecycle statuses include:
- `PRESENT`
- `PARTIAL`
- `ABSENT`
- `LEAVE`
- `HOLIDAY`
- `WEEK_OFF`

One employee has at most one canonical attendance record per organization/date.

## Leave lifecycle

Leave requests support:
- employee
- leave type
- start/end date
- requested days
- reason
- status
- approver
- decision timestamp
- decision notes

Overlapping `PENDING` or `APPROVED` requests are rejected.

Leave overlap validation is serialized per employee inside the transaction. Requested leave quantity must be greater than zero and cannot exceed the selected calendar range; fractional days remain supported.

Transitions:
- `PENDING → APPROVED`
- `PENDING → REJECTED`

A decided leave cannot be decided again.

Events:
- `attendance.leave.requested.v1`
- `attendance.leave.approved.v1`
- `attendance.leave.rejected.v1`

## Holidays

Holiday entries support:
- workspace
- optional branch
- date
- name
- type
- paid/unpaid

A branch-specific holiday affects that branch.

A holiday without a branch applies across the workspace during reconciliation.

## Reconciliation

Daily reconciliation creates missing canonical records for active employees.

Priority:
1. approved leave
2. holiday
3. weekly off
4. absent

Existing records are never overwritten by reconciliation.

The following are committed in one database transaction:
- all newly-created daily records
- one reconciliation outbox event
- audit records by affected workspace

Concurrent/repeated reconciliation uses the daily-record unique key and `ON CONFLICT DO NOTHING`, making the operation retry-safe.

Event:

`attendance.day.reconciled.v1`

## Reports

The summary API supports a bounded maximum range of 366 days.

Per employee it returns:
- total recorded days
- present days
- absent days
- leave days
- holidays
- week offs
- late days
- work minutes
- overtime minutes

Reports can be filtered by:
- employee
- branch
- department

## Permissions

Phase 7 adds:

- `attendance.employee.read`
- `attendance.employee.manage`
- `attendance.department.manage`
- `attendance.shift.read`
- `attendance.shift.manage`
- `attendance.self.punch`
- `attendance.self.leave`
- `attendance.record.read`
- `attendance.record.manage`
- `attendance.leave.read`
- `attendance.leave.manage`
- `attendance.leave.approve`
- `attendance.policy.manage`
- `attendance.report.read`

The same platform permission guard used by CRM, WhatsApp, AI, Automations and Real Estate enforces these permissions server-side.

## Extension events

Registered Phase 7 events:

- `attendance.department.created.v1`
- `attendance.employee.created.v1`
- `attendance.employee.updated.v1`
- `attendance.shift.created.v1`
- `attendance.shift.assigned.v1`
- `attendance.policy.created.v1`
- `attendance.policy.updated.v1`
- `attendance.holiday.created.v1`
- `attendance.employee.checked_in.v1`
- `attendance.employee.checked_out.v1`
- `attendance.leave.requested.v1`
- `attendance.leave.approved.v1`
- `attendance.leave.rejected.v1`
- `attendance.day.reconciled.v1`

## Provider activation

The Attendance manifest uses the same generic extension infrastructure introduced in Phase 6.

Provider flow:

`Provider → Organization → Extensions → Attendance & Employee Operations → Enable`

Activation writes:

`extension.attendance = enabled`

Revocation immediately causes Attendance routes to fail closed with HTTP 403 for that tenant.

No Attendance-specific provider code was required.

## Tenant control center

Route:

`/attendance`

Operational tabs:

### Today
- daily workforce status
- manager/admin manual check-in / check-out
- work-duration display
- reconcile day

The self-punch API is production-backed and certified. A dedicated employee mobile/self-punch experience can be expanded later without changing the Attendance authority model.

### People
- departments
- employee creation
- employee listing

### Shifts
- shift creation
- weekly off configuration
- effective-dated assignment

### Leaves
- leave request creation
- manager approve / reject queue

### Policies
- location-validation policy
- geofence configuration
- remote-punch option
- grace/max-shift rules
- holiday calendar

### Reports
- date-range summary
- present/absent/leave/late/work-hour metrics

The tenant navigation item appears only when the Attendance entitlement is enabled.

## Migration

Migrations:

- `apps/api/drizzle/0009_round_scarlet_witch.sql` — Attendance domain tables, foreign keys and indexes
- `apps/api/drizzle/0010_fearless_random.sql` — GPS accuracy threshold plus concurrent-safe default-policy uniqueness

Migration verification:
- PostgreSQL migrations applied successfully to the real local pgvector/Postgres stack
- total application tables: 94
- attendance tables: 9
- `max_accuracy_meters` default: 100
- workspace default-policy unique index: present
- branch default-policy unique index: present
- attendance punch idempotency unique index: present

## Certification

Phase 7 is covered by the repository e2e certification:

`gates and certifies Attendance & Employee Operations end to end`

Certified scenarios:
- extension disabled by default
- server-side entitlement rejection
- provider enable for two independent tenants
- extension registry activation state
- department creation
- member-linked employee
- non-login employee
- shift creation
- expected work-minute calculation
- shift assignment
- overlapping shift-assignment rejection
- overnight shift attribution to the previous attendance date
- strict geofence policy
- configurable GPS accuracy threshold
- missing-location rejection
- low-accuracy GPS rejection
- outside-geofence rejection
- valid employee check-in
- duplicate idempotency replay
- idempotency-key misuse across a different punch action rejected
- valid employee check-out
- duplicate closed check-out rejection
- manager check-in/out with `ADMIN_OVERRIDE`
- future-dated manager correction rejection
- invalid leave-day quantity rejection
- leave request
- leave approval
- double-decision rejection
- holiday creation
- daily reconciliation
- approved leave → LEAVE
- missing attendance → ABSENT
- summary reporting
- tenant isolation
- provider revocation
- post-revocation route rejection

Final e2e result:

**10 / 10 passing**

## Release gates

Final Phase 7 gate:
- TypeScript typecheck: PASS across API/web/worker
- repo-wide lint: PASS across API/web/worker
- API/worker lint: 0 warnings / 0 errors
- unit tests: 5 / 5 PASS
- full end-to-end suite: 10 / 10 PASS
- Attendance end-to-end certification: PASS
- API production build: PASS
- Worker production build: PASS
- Web production build: PASS
- real PostgreSQL migrations: PASS
- compiled API startup with Attendance routes: PASS
- npm production dependency audit: 0 vulnerabilities

## Phase 7 acceptance gate

Roadmap acceptance requirement:

> A normal company can operate its attendance lifecycle inside the platform.

Result: **PASS**

The platform can now operate:
- employee organization
- departments
- shifts and assignments
- event-based attendance
- optional geofence validation
- manager correction
- leave requests and approvals
- holiday calendar
- daily reconciliation
- attendance reporting
- provider-controlled add-on activation

without continuous employee location tracking and without weakening tenant isolation.

## Deferred by design

Not part of Phase 7:
- payroll
- salary calculation
- statutory payroll compliance
- expense management
- continuous GPS tracking
- biometric device integrations

Payroll remains a later extension.

## Next phase

Build Phase 8 — Business Billing + Advanced Analytics.
