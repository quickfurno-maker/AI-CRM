# SaaS Payment Gateway Runtime

## Status

**Internal runtime complete. Live merchant activation remains external.**

The payment layer plugs into the existing Phase 11 SaaS commercial engine. It does not create a second subscription or invoice truth.

## Runtime flow

### Customer checkout

```text
provider-published plan/add-on price
        ↓
canonical SaaS checkout session
        ↓
payment intent
        ↓
provider order
        ↓
browser provider checkout
        ↓
signed client callback
        ↓
server verifies HMAC
        ↓
server fetches provider payment
        ↓
amount + currency + order + captured-status validation
        ↓
canonical checkout completion
        ↓
SaaS invoice + receipt + subscription/add-on activation
```

The browser never marks money paid.

### Renewal / past-due recovery

```text
commercial maintenance
        ↓
renewal invoice + dunning case
        ↓
PENDING_PROVIDER attempt
        ↓
gateway worker creates idempotent provider order
        ↓
customer action / provider payment
        ↓
signed confirmation or webhook
        ↓
canonical invoice reconciliation
        ↓
dunning recovery + entitlement restoration
```

## Provider abstraction

The API uses a provider-neutral adapter contract:
- create order
- fetch payment
- refund payment
- verify provider webhook
- verify checkout callback signature

Adapters implemented:
- deterministic test adapter for CI/development
- Razorpay production adapter

A new provider can implement the same contract without changing the SaaS commercial state machine.

## Durable payment persistence

Tables:
- `saas_payment_intents`
- `saas_payment_gateway_events`
- `saas_payment_refunds`
- `saas_payment_mandates`

Payment intents are separate from commercial checkout sessions and invoices. They are transport/orchestration records, not the accounting source of truth.

Gateway events are deduplicated by provider + provider event identifier/hash.

Refunds are a separate immutable operational ledger. A refund does not silently cancel the subscription or mutate entitlement policy.

Mandates/payment methods store provider references and safe display metadata only. CRM-AI never stores raw PAN/card/bank credentials.

## Idempotency and concurrency

Controls include:
- existing checkout idempotency
- payment-intent provider/idempotency uniqueness
- provider/order uniqueness
- duplicate active intent reuse per checkout/invoice
- provider-payment uniqueness at the SaaS receipt layer
- webhook event deduplication
- retry-safe `SETTLING → PAID` transition
- canonical commercial settlement methods remain idempotent

A verified payment is not marked `PAID` in the payment-intent ledger until canonical invoice/subscription settlement succeeds.

## Customer endpoints

Authenticated:
- `GET /v1/saas/payment-gateway`
- `GET /v1/saas/payment-methods`
- `POST /v1/saas/checkouts/:id/payment-intent`
- `POST /v1/saas/checkouts/:id/payment-confirmation`
- `POST /v1/saas/invoices/:id/payment-intent`
- `POST /v1/saas/invoices/:id/payment-confirmation`

Public signed provider ingress:
- `POST /v1/saas/payment-webhooks/:provider`

Provider/admin:
- `GET /v1/platform-admin/saas/payment-gateway`
- `POST /v1/platform-admin/saas/payment-gateway/refunds`

## Customer portal

`/subscription`:
- creates canonical plan/add-on checkout first
- requests gateway intent
- in live Razorpay mode, loads Razorpay Checkout dynamically
- sends signed result to server confirmation endpoint
- reloads canonical portal only after server settlement
- offers Pay Now for OPEN/PAST_DUE SaaS invoices
- disabled mode clearly shows live activation pending
- test mode does not pretend to collect real money

Only the public Razorpay Key ID reaches the browser. Key secret and webhook secret remain server-side.

## Provider Commercial Operations

`/provider/commercial` includes:
- gateway mode/provider
- recent payment intents
- signed event count/status
- refund records
- guarded partial refund form
- activation-pending state

## Worker collection

The commercial worker:
1. produces canonical renewal invoices/dunning attempts;
2. payment worker finds `PENDING_PROVIDER` attempts;
3. creates an idempotent provider order when payment mode is active;
4. marks the attempt `ACTION_REQUIRED`;
5. emits `saas.payment.customer_action_required.v1`.

The worker never fabricates payment success.

## Razorpay verification

Production adapter:
- creates orders server-side;
- uses Basic authentication from Secrets Manager;
- verifies checkout HMAC over `order_id|payment_id`;
- verifies webhook HMAC over the raw request body;
- fetches payment server-side;
- requires captured status;
- validates exact order, amount and currency;
- supports provider refunds.

Important provider events:
- `payment.captured`
- `payment.failed`
- `refund.processed`
- `refund.failed`
- `order.paid` may be enabled as an additional success signal

## Environment

```text
SAAS_PAYMENT_MODE=disabled|test|live
SAAS_PAYMENT_PROVIDER=test|razorpay
SAAS_PAYMENT_ALLOWED_CURRENCIES=INR
SAAS_PAYMENT_TEST_SECRET=...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

Production forbids test mode. Live mode currently requires Razorpay and all three Razorpay values.

## Terraform / deployment

Production variables:
- `saas_payment_mode`
- `saas_payment_provider`
- `saas_payment_allowed_currencies`
- `payment_runtime_secret_arn`

The payment secret is expected to be an AWS Secrets Manager JSON secret containing:
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Terraform refuses live payment mode when the secret ARN is absent.

The deploy workflow exposes payment mode as a deliberate release input and defaults to disabled.

## Internal certification

Automated coverage includes:
- deterministic order creation
- checkout HMAC verification
- webhook HMAC verification
- malformed signature rejection
- captured payment parsing
- refund adapter behavior
- full Phase 11 signed plan checkout
- canonical invoice/receipt/subscription settlement
- duplicate webhook idempotency
- partial refund
- overdue invoice payment
- dunning recovery
- migration/idempotence/schema certification
- API/web/worker/container builds
- Terraform validation

## External activation only

Still requires real-world configuration/evidence:
- Razorpay production merchant account
- production Key ID / Key Secret
- production webhook secret
- production webhook URL registration
- selected live webhook subscriptions
- settlement/bank-account configuration
- real low-value payment and refund drill
- real failed-payment drill
- real renewal/recovery drill
- operator alert routing

No additional core payment-gateway architecture should be necessary for activation.
