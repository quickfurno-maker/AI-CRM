# Meta WhatsApp Partner Architecture

## Decision

The Business OS will be built as a **Meta WhatsApp partner platform**, not as a CRM that asks every customer to paste a permanent access token.

Target path:

```
Third-party Developer
        ↓
Meta Tech Provider
        ↓
Meta Tech Partner
        ↓
Optional future Solution Partner capability
or collaboration with a Solution Partner for credit-line billing
```

This is the primary product architecture.

Manual WABA/token configuration remains available only for:
- local development
- sandbox/testing
- migration/support fallback

It is not the intended customer onboarding experience.

---

## Meta partner roles

### Tech Provider — first target

The platform first onboards as a **Tech Provider**.

This allows us to build and operate value-added software around WhatsApp Business Platform and onboard business customers using Embedded Signup.

### Tech Partner — growth target

After Meta eligibility requirements are met, the company should initiate the Tech Partner upgrade.

The application architecture must not require a rewrite for this transition.

### Solution Partner — optional commercial expansion

Only a Solution Partner can extend a Meta line of credit to client businesses.

Therefore we support two billing models from the architecture:

```
CLIENT_DIRECT
SOLUTION_PARTNER_CREDIT_LINE
```

Initial production launch should use client-direct Meta billing unless/until our company becomes eligible for the required partner/billing capability or works with an existing Solution Partner.

WhatsApp usage billing and our own SaaS subscription billing remain separate domains.

---

## Asset ownership

Client Meta assets remain client-owned.

```
Client Business
 ├── Meta Business Portfolio
 ├── WhatsApp Business Account (WABA)
 └── WhatsApp Phone Number(s)

Our SaaS
 └── delegated access to operate authorized assets
```

We must never architect the product around creating every customer's WABA or phone number under our ownership.

Benefits:
- client portability
- lower lock-in risk
- cleaner offboarding
- easier account sharing with other Meta partners
- clearer legal/data ownership
- future Solution Partner interoperability

The database therefore records:

```
client_asset_ownership = CLIENT
```

as the default invariant.

---

## Primary customer onboarding

The target customer flow is:

```
Business OS
  ↓
Settings → WhatsApp → Connect WhatsApp
  ↓
Meta Embedded Signup
  ↓
Customer authenticates with Meta
  ↓
Customer selects/creates Meta Business Portfolio
  ↓
Customer selects/creates WABA
  ↓
Customer selects/adds WhatsApp phone number
  ↓
Meta returns onboarding result
  ↓
Our backend exchanges/validates authorization
  ↓
Fetch shared WABA IDs
  ↓
Assign system user / delegated access as required
  ↓
Subscribe our app to WABA
  ↓
Register phone number + required two-step verification
  ↓
Sync WABA / phone / templates / quality state
  ↓
Create MetaBusinessConnection
  ↓
Create one ChannelAccount per phone number
  ↓
Activate Unified Inbox / Campaigns / AI / Automation
```

The customer should not normally copy API credentials into our UI.

---

## Current Meta API permissions

Cloud API runtime uses:

- `whatsapp_business_management`
- `whatsapp_business_messaging`

Business portfolio / partner onboarding flows may also require:

- `business_management`

For Embedded Signup release, Meta currently requires App Review and Advanced Access for the relevant business-management permissions.

Permissions and App Review requirements must be treated as deployment configuration, not hard-coded assumptions.

---

## Domain model

### MetaBusinessConnection

Represents the tenant's delegated relationship with a client Meta Business Portfolio/WABA.

Important fields:

```
id
organization_id
workspace_id

onboarding_mode
connection_status

client_asset_ownership
partner_role
billing_mode

meta_business_portfolio_id
waba_id
assigned_system_user_id

credential_ref
embedded_signup_state

access_granted_at
app_subscribed_at
connected_at
disconnected_at
last_synced_at

metadata
```

### ChannelAccount

Represents an individual communication endpoint.

For WhatsApp:

```
MetaBusinessConnection
        ↓
WABA
        ↓
Phone Number 1 → ChannelAccount
Phone Number 2 → ChannelAccount
Phone Number N → ChannelAccount
```

A ChannelAccount contains:
- provider
- channel type
- WABA/provider account ID
- Phone Number ID
- display number/name
- credential reference where needed
- connection status

This lets the generic communication engine also support Instagram, Messenger, email, web chat and future channels.

---

## Onboarding states

Recommended connection state machine:

```
PENDING
  ↓
EMBEDDED_SIGNUP_STARTED
  ↓
AUTHORIZATION_RECEIVED
  ↓
WABA_DISCOVERED
  ↓
ACCESS_GRANTED
  ↓
APP_SUBSCRIBED
  ↓
PHONE_REGISTRATION_PENDING
  ↓
PHONE_REGISTERED
  ↓
SYNCING
  ↓
CONNECTED
```

Failure/terminal states:

```
ACTION_REQUIRED
FAILED
REVOKED
DISCONNECTED
```

Every transition must be auditable and retry-safe.

---

## Phone registration

Phone registration is an explicit onboarding step.

The partner integration must support:
- phone ownership verification
- required two-step verification/PIN
- registration status
- re-registration after approved display-name changes
- deregistration/offboarding

Registration secrets/PINs must never be stored in audit logs or ordinary application tables.

---

## WABA app subscription and webhook routing

We use one central Meta application/webhook layer.

```
Meta Webhooks
      ↓
Public Webhook Gateway
      ↓
Signature Verification
      ↓
Raw Payload Hash / Deduplication
      ↓
Phone Number ID / WABA Router
      ↓
MetaBusinessConnection
      ↓
Tenant + Workspace
      ↓
ChannelAccount
      ↓
Conversation Engine
```

Tenant identity is resolved from verified Meta asset mappings.

A webhook payload must never be allowed to choose its own tenant using an arbitrary browser/user-supplied tenant ID.

Unknown Phone Number IDs fail closed.

---

## Webhook events

The Meta gateway should handle at least:

### Messaging
- inbound messages
- sent
- delivered
- read
- failed

### Account / partner state
- template approval/rejection/status
- template quality
- phone number quality changes
- phone display-name updates
- WABA review changes
- bans/restrictions where exposed
- asset/access changes

Webhook delivery is at-least-once.

Every handler must be:
- idempotent
- retry-safe
- order-aware where required
- tenant-routed
- auditable

---

## Unified conversation architecture

```
Meta WhatsApp
      ↓
Provider Adapter
      ↓
ChannelAccount
      ↓
Conversation
      ↓
Contact Identity Resolution
      ↓
CRM Contact / Lead / Deal
      ↓
AI + Automation + Human Inbox
```

Unknown inbound WhatsApp identities can create or resolve a CRM Contact according to tenant policy.

The communication domain remains provider-neutral.

---

## Outbound messaging

### Service-window message

Free-form text can be sent only when provider policy allows it, including the active customer-service window.

### Template message

Outside the service window, outbound WhatsApp initiation uses an approved template.

### Marketing

Marketing sends additionally require:
- tenant marketing permission
- valid consent
- approved template
- policy/frequency controls
- campaign approval if configured

The platform must reject invalid sends before calling Meta.

---

## Template management

The SaaS will provide a tenant Template Studio.

Capabilities:
- local draft
- local review
- submit/sync with Meta
- Meta template ID
- language
- category
- components
- approval state
- quality state
- rejection/error state
- version/audit history

Meta remains authoritative for provider approval and quality state.

---

## Campaign management

The product can provide AiSensy-style campaign management:

```
CRM Audience / Segment
       ↓
Consent + DNC Filter
       ↓
Channel
       ↓
Approved Template
       ↓
Personalization
       ↓
Schedule / Approval
       ↓
Send Queue
       ↓
Meta Cloud API
       ↓
Delivery / Read / Reply Events
       ↓
Campaign Analytics
```

Campaigns are tenant-scoped.

No campaign may bypass:
- consent policy
- Meta template rules
- frequency caps
- quiet hours
- tenant permissions
- plan entitlements
- usage limits

---

## Billing architecture

There are three different money flows and they must not be mixed.

### 1. SaaS subscription billing

Customer pays us for:
- CRM
- users
- AI
- automation
- campaign functionality
- extensions
- analytics
- plan add-ons

### 2. WhatsApp / Meta usage

Initial model:

```
Customer ↔ Meta billing
Our SaaS records/meter usage
```

Future Solution Partner model:

```
Customer → Us / Solution Partner
             ↓
       aggregated Meta billing
```

### 3. Customer's own business billing

Quotes/invoices/payments generated by our CRM are a separate business domain.

Never combine these ledgers.

---

## Credential architecture

Production credentials must use secret references.

Application tables store:

```
credential_ref
```

not raw credentials.

Examples:

```
aws-secrets-manager://...
vault://...
```

Development may temporarily use:

```
env:META_...
mock:...
```

but production must move to managed secret storage.

Credential rotation must not require changing CRM/conversation records.

---

## Partner program evolution without rewrite

Architecture invariant:

```
Tech Provider
      ↓
Tech Partner
      ↓
Solution Partner / Solution Partner collaboration
```

must require configuration/business-capability changes, not a redesign of:
- CRM
- conversations
- campaigns
- AI
- webhook routing
- tenant model

The partner role is therefore stored as connection/platform metadata and is not used as the identity of client assets.

---

## Phase 3 implementation order

### P3.1 — Partner connection foundation
- MetaBusinessConnection table
- Embedded Signup state
- delegated asset model
- Phone Number ID / WABA tenant routing
- secret references
- partner/billing modes

### P3.2 — Embedded Signup backend
- signed onboarding state
- Meta callback/code exchange
- fetch shared WABA
- system-user/access assignment
- subscribe app to WABA
- phone registration
- initial asset sync
