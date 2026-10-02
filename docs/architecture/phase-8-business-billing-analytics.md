# Phase 8 — Business Billing & Advanced Analytics

## Status

Phase 8 is complete and certified.

This phase adds customer-business billing and governed cross-domain reporting to the generic Business OS.

Important domain boundary:

- Business Billing = the tenant's own quotes, invoices, payments, receipts and credit notes.
- SaaS Billing = our platform plans, subscriptions, add-ons, metering and platform invoices.

These remain separate bounded contexts.

## Business Billing

API namespace:

`/v1/business-billing`

Tenant/workspace-scoped objects:

- Billing Settings
- Document Sequences
- Tax Rates
- Quotes
- Quote Items
- Invoices
- Invoice Items
- Payments / Receipts
- Credit Notes

### Billing settings

Each workspace can configure:

- legal business name
- tax identifier
- billing email / phone
- billing address
- country
- currency
- quote prefix
- invoice prefix
- credit-note prefix
- receipt prefix
- default payment terms

### Quotes

Quote lifecycle:

```
DRAFT
→ SENT
→ ACCEPTED / REJECTED
→ CONVERTED
```

Issued quotes are immutable.

A quote captures a customer snapshot at issue time so later CRM edits do not silently change an already-issued commercial document.

Quote totals support:

- quantity
- unit price
- line discount
- tax rate
- subtotal
- discount total
- tax total
- grand total

### Invoices

Invoices may be created directly or converted from an accepted quote.

Invoice lifecycle supports:

```
DRAFT
→ ISSUED
→ PARTIALLY_PAID
→ PAID
```

Additional governed states include:

- OVERDUE
- VOID
- CREDITED

Issuing an invoice freezes the customer/commercial snapshot and assigns a durable document number.

Overdue state is refreshed from due date and balance state.

### Payments

Payments are recorded against issued invoices and create tenant-scoped receipt numbers.

Current supported payment methods are stored generically, allowing channels such as:

- UPI
- bank transfer
- cash
- card / external provider reference

A payment cannot exceed the remaining collectible balance.

Invoice state and balance are updated atomically with payment/receipt creation.

### Credit notes

Credit notes reduce the invoice collectible balance without rewriting the issued invoice.

Credit-note issuance is independently permissioned and numbered.

### Document numbering

Quote, invoice, receipt and credit-note numbers use database-backed sequences scoped by organization + workspace + document type.

Concurrency certification proves simultaneous document issue operations receive unique sequential numbers.

### Permissions

- `business_billing.read`
- `business_billing.manage`
- `business_billing.payment.manage`
- `business_billing.credit_note.manage`

## Advanced Analytics

API namespace:

`/v1/analytics`

Primary endpoint:

`GET /v1/analytics/overview`

The reporting layer is tenant-scoped and supports an optional workspace scope plus a bounded date range.

Maximum ad-hoc analytics range:

- 366 days

The overview combines canonical data across Business OS modules rather than asking AI to calculate metrics from raw database access.

### Finance metrics

- invoiced value
- collected value
- outstanding receivables
- overdue receivables
- invoice count
- paid invoice count
- collection rate

### CRM metrics

- leads created
- qualified leads
- hot leads
- deals created
- won deals
- lost deals
- open pipeline value
- won value
- win rate

### WhatsApp / communication metrics

- conversations
- inbound messages
- outbound messages
- delivered/successful messages
- failed messages
- message success rate
- campaigns
- campaign recipients
- campaign sent
- campaign failed

### AI operations metrics

- AI runs
- completed runs
- failed runs
- total tokens
- estimated AI cost
- average latency
- success rate

### Attendance metrics

- attendance records
- present
- absent
- leave
- work hours
- late minutes
- overtime hours

### Real Estate metrics

- requirements
- site visits
- completed visits
- bookings
- confirmed bookings
- confirmed booking amount

### Commercial reporting

Also included:

- salesperson performance
- open pipeline by salesperson
- won value by salesperson
- receivables aging:
  - current
  - 1–30 days
  - 31–60 days
  - 61–90 days
  - 90+ days
- daily time series:
  - invoiced
  - collected
  - won-deal value

## Governed AI analytics

Registered AI tool:

`get_business_analytics`

The tool reads the same governed analytics service used by the UI.

AI agents do not query tables directly.

This means the model can explain trends and answer business questions while:

- tenant isolation remains enforced
- workspace scope remains explicit
- date range remains bounded
- metrics remain canonical
- raw database access is not exposed

Permission:

`analytics.ai.ask`

Read permission:

`analytics.read`

## UI

### Billing Control Center

Route:

`/billing`

Includes:

- billing dashboard
- billing identity / numbering settings
- quote creation
- quote list
- quote issue/decision workflow
- invoice creation
- invoice list
- invoice issue workflow
- payment recording
- credit-note recording
- outstanding / overdue visibility

### Analytics Control Center

Route:

`/analytics`

Includes:

- 7 / 30 / 90-day views
- finance scorecards
- sales funnel
- WhatsApp/campaign metrics
- AI operations
- attendance
- Real Estate
- receivables aging
- daily commercial pulse
- salesperson performance
- link to governed AI analytics configuration

Billing and Analytics are wired into the existing navigation across dashboard, CRM, WhatsApp, AI Agents and Automations.

## Database

Phase 8 migration:

`0011_hard_tomorrow_man.sql`

Adds 9 billing tables.

After applying all migrations to the real local pgvector/PostgreSQL stack:

- public tables: 103
- Phase 8 business billing tables: 9
- document uniqueness indexes verified: 4

Real local infrastructure:

- PostgreSQL / pgvector on `127.0.0.1:15432`
- Redis on `127.0.0.1:16379`

## End-to-end certification

The Phase 8 test certifies:

```
CRM contact
→ Billing settings
→ Quote draft
→ Quote issue
→ Quote acceptance
→ Invoice conversion
→ Invoice issue
→ Partial payment
→ Credit note
→ Final payment
→ PAID invoice
→ Analytics
```

Verified outcomes include:

- tax/discount arithmetic
- immutable issued quote
- customer snapshot
- quote → invoice conversion
- correct invoice balance
- partial-payment state
- receipt numbering
- credit-note numbering
- credit-note balance adjustment
- final PAID state
- overpayment rejection
- overdue recognition
- concurrent quote numbering uniqueness
- cross-tenant invoice denial
- finance analytics
- receivables aging
- governed AI analytics tool registration
- analytics date-range rejection beyond 366 days

## Final quality gate

Passed:

- TypeScript: API / web / worker
- lint: 0 warnings / 0 errors
- unit tests: 5 / 5
- end-to-end tests: 11 / 11
- API production build
- worker production build
- Next.js production build
- dependency audit: 0 vulnerabilities
- real PostgreSQL migration
- real compiled API startup
- API health: database ok
- Phase 8 permission bootstrap: 6 / 6
- governed AI analytics tool bootstrap: 1 / 1

## Compliance boundary

Phase 8 provides configurable business billing primitives and tax calculations.

It does not claim to be a statutory tax filing engine, GST return filing system, e-invoicing compliance gateway, accounting ledger, or regulated payment processor.

Those provider/compliance-specific integrations must be added explicitly if required.

## Phase 8 result

The generic Business OS now has an integrated operational loop:

```
CRM
+ WhatsApp
+ AI
+ Automation
+ Real Estate extension
+ Attendance / Employees
+ Customer Business Billing
+ Cross-domain Analytics
```

This is now a substantially complete operational Business OS foundation while preserving the separation between tenant business billing and our own SaaS subscription/metering domain.
