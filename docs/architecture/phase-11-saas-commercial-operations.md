# Phase 11 — SaaS Commercial Operations

## Status

**Internal commercial engine is complete and certified.**

The only material remaining dependency is activation of a real payment-provider adapter and provider-side payment credentials/webhooks.

## Boundary

Phase 11 is what customers pay **us** for the SaaS.

It is separate from Phase 8 Customer Business Billing, which is what a tenant charges its own customers.

## Commercial identity model

A staff record is not a paid seat.

The platform separates:
1. staff profile;
2. tenant membership/login;
3. RBAC/resource scope;
4. commercial product seat.

Supported seat/access classes:
- FULL
- LIGHT
- ATTENDANCE_ONLY
- GUEST

AI agents, automations, OAuth clients, API keys and webhooks do not consume human seats.

## Product catalog

Provider controls:
- plans
- monthly/yearly prices
- tax rate per price
- free-trial days
- usage meter policies
- add-ons
- add-on prices
- coupons/promotions

Customer-supplied checkout amounts are never trusted. Checkouts reference provider-published price IDs.

## Subscription lifecycle

Implemented:
- trial start
- one-trial-per-organization enforcement
- trial expiry
- paid activation
- monthly/yearly cycle
- immediate same-cycle upgrades with remaining-period proration
- scheduled downgrades
- scheduled cycle changes
- cancel at period end
- immediate administrative cancellation
- cancellation revocation/reactivation before end
- grace period
- restricted state after failed-payment grace

Conservative money rule:
- upgrades can require immediate positive payment;
- reductions/downgrades are scheduled to the next period;
- the system does not silently invent negative wallet balances or credits.

## Add-ons

Implemented:
- provider-defined entitlement mapping
- ENABLE add-ons
- LIMIT_INCREMENT add-ons
- paid quantity increases
- scheduled quantity reductions/cancellation
- period alignment with subscription
- entitlement reconciliation

## Usage metering

Commercial ledger is immutable/idempotent by tenant + usage idempotency key.

Connected runtime meters:
- AI agent runs
- OpenAI tokens
- WhatsApp direct messages
- WhatsApp template messages
- WhatsApp campaign messages
- automation runs
- external API requests

Meter policy supports:
- included quantity
- unit
- unit price
- warning threshold
- OVERAGE
- THROTTLE
- HARD_LIMIT

Operational-domain usage records remain available for diagnostics; the SaaS usage ledger is the commercial source for plan enforcement/billing.

## Checkout

Provider-neutral checkout sessions include:
- plan/add-on price reference
- quantity
- coupon
- subtotal
- discount
- tax
- total
- currency
- idempotency key
- provider/session/payment references
- expiry
- completion/failure state

No card/bank credentials are stored by CRM-AI.

Until the external payment adapter is activated, the UI explicitly reports that provider payment activation is pending rather than fabricating a paid state.

## SaaS invoices and receipts

Separate SaaS ledger:
- customer SaaS billing profile
- invoice
- invoice lines
- receipt
- plan line
- add-on line
- usage overage line
- tax
- payment-provider reference

This data is not stored in Phase 8 customer business invoices.

## Renewals and dunning

Worker maintenance handles:
- trial expiry
- ended subscription periods
- scheduled cancellation
- renewal invoice preparation
- pending plan/add-on changes
- usage overage lines
- dunning case creation
- collection-required outbox events
- retry schedule
- grace period
- restricted state and entitlement shutdown

The worker does not invent a payment-provider success. It emits provider-neutral collection requests until the real adapter is activated.

## Entitlements

Commercial entitlement reconciliation combines:
- base plan features
- active add-ons
- provider/system overrides

Plan-managed commercial entitlements are deterministically enabled/disabled as subscription state changes.

Provider/system overrides remain authoritative and are not overwritten by ordinary plan reconciliation.

## Customer Subscription Portal

Route:
`/subscription`

Customer can view:
- current plan
- subscription status
- period end
- billing profile
- plan catalog
- monthly/yearly prices
- add-ons
- usage and allowance
- overage estimate
- invoices
- receipts
- dunning/recovery state

Customer can:
- save SaaS billing profile
- start eligible trial
- create plan checkout
- create add-on checkout
- schedule downgrade/cycle change
- cancel at period end
- revoke scheduled cancellation

## Provider Commercial Operations

Route:
`/provider/commercial`

Provider can:
- create/update plans
- publish plan prices
- configure usage meters
- create add-ons
- publish add-on prices
- create coupons
- view active subscriptions
- view MRR/ARR
- view trials/past-due/dunning
- view trial conversion/churn indicators
- reconcile provider payment success/failure through guarded endpoints

## Payment-provider activation boundary

Still external:
- choose/configure live payment gateway
- production API credentials
- payment checkout/session creation adapter
- signature-verified provider webhooks
- renewal collection adapter
- refund/credit behavior if commercially approved
- real payment failure/recovery drill

The internal domain does not hard-code one gateway.

## Certification

The integrated Phase 11 runtime is covered by the repository quality gates and migration/container certification at baseline `485f33e`.

Database schema after the consolidated migration:
**137 public tables**.

## Result

The commercial state machine, ledger, entitlement integration, usage metering, customer portal and provider console are implemented.

A real payment provider is the only dependency required to turn provider-neutral payment intents/collection events into live monetary collection.
