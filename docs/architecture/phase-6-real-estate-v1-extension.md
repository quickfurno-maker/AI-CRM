# Phase 6 — Real Estate V1 Extension

## Status

Phase 6 is complete and certified.

Real Estate is implemented as the first industry extension on top of the generic Business OS. The universal CRM remains industry-neutral; the extension adds property-specific objects, permissions, events, AI tools, workflows and UI without changing Contact, Lead, Deal or Appointment semantics.

## Extension platform

A reusable extension boundary now exists under:

`apps/api/src/platform/extensions`

It provides:
- extension manifests
- entitlement metadata
- tenant extension discovery
- a global entitlement guard
- provider-controlled activation

Real Estate manifest:
- key: `real-estate`
- version: `1.0.0`
- entitlement: `extension.realestate`

The same registry/guard model can be reused by later verticals.

## Provider control

Platform administrators can manage client add-ons through:

- `GET /v1/platform-admin/organizations/:id/extensions`
- `PUT /v1/platform-admin/organizations/:id/extensions/:extensionKey`

Enable/disable operations:
- upsert the tenant entitlement
- use source `ADDON`
- write an audit record
- emit `platform.extension.updated.v1`

The tenant receives a hard 403 when the extension is disabled.

A provider-only web console is available at:

`/provider`

Normal tenants do not receive the Provider navigation item.

## Real Estate domain

The extension owns these objects:
- Developer
- Project
- Building / Tower
- Unit / Property
- Property Owner
- Broker
- Requirement
- Requirement Match
- Site Visit
- Offer
- Booking
- Commission

The extension deliberately reuses core CRM objects:
- Contact
- Lead
- Deal
- Appointment

## Inventory model

Inventory supports both:
1. project/developer inventory
2. independent/resale inventory

A unit may have:
- optional project
- optional building/tower
- optional property owner
- city/locality/address
- latitude/longitude
- property type
- configuration
- bedrooms/bathrooms
- carpet and built-up area
- floor/facing
- price/currency
- inventory status
- possession status
- amenities
- metadata

Project-linked units inherit project location at creation when unit-level location is not supplied.

## Buyer requirements

Requirements can store:
- purpose
- cities
- localities
- property types
- configurations
- minimum/maximum budget
- minimum/maximum carpet area
- purchase timeline
- possession preference
- must-have amenities
- CRM contact
- optional CRM lead
- owner/member
- status

## Deterministic property matching

Property matching is governed and explainable.

Hard constraints are applied before scoring:
- tenant
- AVAILABLE inventory status
- city
- locality
- property type
- configuration
- budget range
- carpet area range
- must-have amenities

Database-side prefiltering is used for scalable candidate selection instead of scanning complete tenant inventory in memory.

The PostgreSQL query is bounded, then deterministic application scoring produces an explainable score and reasons.

Typical reasons:
- Preferred locality
- Preferred city
- Property type
- Configuration
- Within budget
- Carpet area
- Required amenities

Rematching replaces stale match rows atomically instead of accumulating obsolete recommendations.

Supporting inventory indexes include:
- organization/project/status
- organization/type/configuration
- organization/city/locality
- organization/status/price
- organization/status/carpet-area

## Site visits

A site visit can target:
- a project
- a specific project unit
- a standalone/resale unit

At least a project or unit is required.

Scheduling a site visit atomically creates:
1. the canonical CRM Appointment
2. the CRM appointment outbox event + audit
3. the Real Estate Site Visit
4. the Real Estate site-visit outbox event + audit

Completing, cancelling or marking a visit no-show updates the linked CRM Appointment in the same transaction.

This preserves one calendar/appointment truth across the Business OS.

## Booking safety

Reservation is concurrency-safe.

A booking claims inventory with a conditional database update:

`AVAILABLE → HOLD`

Only one transaction can claim an available unit.

Booking transitions are explicit:
- RESERVED → CONFIRMED
- RESERVED → CANCELLED
- CONFIRMED → CANCELLED
- same-state updates are allowed
- invalid backward transitions are rejected

Inventory transitions:
- RESERVED → HOLD
- CONFIRMED → BOOKED
- CANCELLED → AVAILABLE

A second booking against a non-AVAILABLE unit is rejected.

## Offers, brokers and commissions

The extension supports:
- property owners backed by CRM contacts
- brokers backed by CRM contacts
- offers linked to unit / requirement / deal
- bookings linked to contact / unit / optional deal / offer / broker
- commissions linked to booking and optional broker

Meaningful mutations use the transactional outbox and audit log.

## Permissions

Phase 6 adds:
- `realestate.inventory.read`
- `realestate.inventory.manage`
- `realestate.requirement.read`
- `realestate.requirement.manage`
- `realestate.visit.read`
- `realestate.visit.manage`
- `realestate.booking.read`
- `realestate.booking.manage`

Tenant ownership and organization scoping are enforced on extension records.

## AI tools

The governed AI tool registry now includes:

### search_properties
Risk: L0

Queries real, AVAILABLE tenant inventory using explicit filters.

### recommend_properties
Risk: L1

Runs the same deterministic Real Estate matcher for an existing buyer requirement. AI does not invent its own opaque property ranking.

### schedule_site_visit
Risk: L2

Schedules a governed site visit and creates the canonical CRM appointment.

All Real Estate AI actions remain subject to:
- agent tool policy
- tenant isolation
- extension entitlement
- AI audit/execution history
- risk policy

## Tenant control center

Tenant route:

`/real-estate`

Includes:
- Real Estate KPI cards
- Inventory
- Buyer Requirements
- Explainable Matches
- Site Visits
- Bookings

Inventory UI supports project and standalone property creation.

When the entitlement is off, the extension is blocked and the dashboard navigation does not expose it.

## Provider console

Provider route:

`/provider`

Platform administrators can:
- browse client organizations
- inspect registered extensions
- view entitlement/source state
- enable an extension
- disable an extension

Provider navigation is shown only when the authenticated principal is a platform administrator.

## Database migrations

Phase 6 migrations:
- `0007_violet_thing.sql`
- `0008_sticky_nitro.sql`

The first creates the Real Estate domain tables.

The second:
- makes Site Visit project linkage nullable for standalone/resale units
- uses ON DELETE SET NULL for project linkage
- adds price and carpet-area availability indexes

Real PostgreSQL migration verification:
- PostgreSQL/pgvector healthy
- 85 public tables
- `re_site_visits.project_id` nullable
- both new matching indexes present

## Real runtime certification

The compiled Nest API was started against the real local PostgreSQL/pgvector database.

Verified:
- API health: database OK
- ExtensionsModule initialized
- RealEstateModule initialized
- AiModule initialized with Real Estate dependency
- all Real Estate HTTP routes mapped
- 8 Real Estate permissions bootstrapped
- 3 Real Estate AI tools bootstrapped

## End-to-end certification

The Phase 6 acceptance test covers:

```
Provider enables Real Estate add-on
→ CRM contact
→ Project / inventory
→ Buyer requirement
→ Deterministic property match
→ Explainable persisted match
→ Site visit
→ CRM appointment
→ Standalone resale visit
→ Atomic reservation
→ Inventory HOLD
→ Booking confirmation
→ Inventory BOOKED
→ duplicate booking rejection
→ cross-tenant mutation rejection
→ provider disables extension
→ tenant access denied
```

The test also verifies an invalid booking rollback transition is rejected.

## Final quality gate

Passed:
- TypeScript: API / web / worker
- lint: API / web / worker
- API unit tests: 5/5
- end-to-end tests: 9/9
- API production build
- worker production build
- Next.js production build
- dependency audit: 0 vulnerabilities
- real PostgreSQL migrations
- compiled API startup against the real database

## Phase 6 result

The Business OS now has a reusable extension architecture and its first complete industry pack.

The generic core remains:

```
Identity / Tenant
+ CRM
+ Communication / Meta WhatsApp
+ Governed AI
+ Automation
+ Entitlements / Billing foundation
```

Real Estate is layered on top as:

```
Inventory
+ Buyer Requirements
+ Deterministic Matching
+ Site Visits
+ Offers
+ Bookings
+ Brokers / Commissions
+ Governed AI Tools
```

Future industry extensions can reuse the same registry, entitlement and provider-control model without changing the generic CRM core.
