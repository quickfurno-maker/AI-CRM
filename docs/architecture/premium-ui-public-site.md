# Premium UI/UX + Public SaaS Website

## Status

**Internal implementation complete on `feat/ui-ux-hardening`.**

Deployment, final domain configuration, production analytics tags and live provider/payment activation remain deliberately external.

## Product UI architecture

The application now uses a single premium shell across authenticated product modules:
- entitlement-aware primary navigation
- collapsible desktop sidebar
- responsive mobile drawer
- sticky global top bar
- command palette (`Cmd/Ctrl + K`)
- shared visual tokens and premium surface hierarchy
- keyboard focus treatment
- reduced-motion support
- common loading skeletons
- global error and 404 states
- common empty-state primitives
- legacy page sidebars visually absorbed into the unified shell

The shell keeps public marketing/auth routes outside the authenticated application chrome.

## Premium public website

Public routes:
- `/` — flagship product homepage
- `/platform` — complete capability overview
- `/pricing` — SaaS subscription, seat and usage model
- `/security` — tenant isolation, RBAC, AI governance and production architecture
- `/login`
- `/register`
- `/sso/*`

The homepage includes:
- premium hero and interactive-style product showcase
- CRM / WhatsApp / AI / automation / analytics / Real Estate capability cards
- governed OpenAI + WhatsApp story
- public subscription section
- enterprise/security story
- commercial CTA flow into workspace registration

## Pricing source of truth

The public pricing component reads:

```text
GET /v1/saas/catalog
```

through the web API proxy.

The API endpoint is intentionally public and returns only active plans/prices/add-ons.

This prevents the marketing website from inventing or duplicating commercial prices. Provider Commercial Operations remains the source of truth. If the provider catalog has not yet been published, the website renders launch-plan positioning without fabricating numeric pricing.

Commercial rules surfaced publicly:
- staff record != paid product seat
- explicit FULL / LIGHT / ATTENDANCE_ONLY / GUEST access classes
- monthly/yearly subscription lifecycle
- plan + add-on model
- usage-aware AI / WhatsApp / automation capabilities
- SaaS billing is separate from tenant customer billing

## High-frequency UX hardening

### CRM
- deliberate initial skeleton
- in-context search by current object type
- premium error semantics
- shared shell integration

### WhatsApp
- deliberate initial skeleton
- conversation search
- clearer empty states
- message timestamps
- automatic latest-message positioning
- accessible reply input
- human / AI / AI Assist operational context retained

### Automations
- premium loading state
- accessible tab semantics
- dedicated React Flow visual treatment
- premium node / edge / controls / minimap styling
- run trace highlighting retained
- draft/activation controls retained

### AI Agents
- premium loading state
- accessible control-plane tabs
- governed tool / knowledge / approval / usage workflows retained

### Other product surfaces
Premium loading/error/entry treatments are standardized across:
- Analytics
- Billing
- Staff & Seats
- Team & Access
- Subscription
- Attendance
- Real Estate
- Developer Platform
- Enterprise
- Marketplace
- Provider Console
- Provider Commercial Operations
- Provider Marketplace
- AI WhatsApp

## Accessibility baseline

Implemented:
- skip-to-workspace link
- main landmark
- active-navigation semantics
- tablist/tab semantics on high-complexity control planes
- labelled command palette
- labelled WhatsApp search/reply inputs
- global `:focus-visible`
- reduced-motion handling
- responsive touch-friendly controls
- route-level error semantics

## Responsive strategy

Breakpoints preserve:
- mobile public website
- mobile authenticated drawer navigation
- tablet page spacing
- dense workspace overflow behavior
- responsive pricing cards and platform feature rows
- Automation canvas minimum usable height

## UI quality gate

`npm run ui:quality` statically asserts the premium product baseline:
- app shell
- public marketing routes
- public catalog pricing
- focus/reduced-motion support
- Automation canvas treatment
- AI/Automation tab semantics
- CRM loading/search conventions
- WhatsApp search/latest-message UX

CI runs this gate after lint and before unit/e2e/build certification.

## SEO / crawler boundary

`robots.ts` explicitly allows the public marketing pages and disallows authenticated/product/API surfaces.

A production sitemap and canonical absolute URLs should be added only when the real production domain is chosen; domain selection is an external deployment dependency.

## External-only items intentionally deferred

- final production domain / canonical URL
- sitemap hostname
- analytics/marketing pixels
- consent-management provider if required
- live payment checkout redirect
- Meta live signup credentials
- OpenAI production credentials
- public email/contact routing
- production deployment

None of these are blockers to the internal website/UI implementation.
