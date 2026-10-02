# Phase 9 — Platform Expansion

## Status

Phase 9 is complete and certified.

This phase turns the Business OS from a first-party application platform into a governed provider platform with:
- developer credentials
- OAuth client credentials
- outbound event webhooks
- a controlled extension marketplace
- provider-controlled add-ons
- enterprise security policy
- OIDC SSO foundations
- SCIM provisioning
- encrypted platform secrets
- worker-based webhook delivery and retention jobs

The Phase 9 design preserves the existing multi-tenant core. External integrations are never given direct database access and marketplace extensions do not execute arbitrary third-party code inside the CRM-AI runtime.

## Provider add-ons

Provider-controlled add-ons:
- core.api
- marketplace.enabled
- enterprise.controls

Only a platform administrator can enable or disable these capabilities for a client organization.

Provider changes are:
- persisted through the entitlement engine
- audited
- emitted through the transactional outbox

The provider console exposes organization add-ons and marketplace publishing controls.

## Developer Platform

### API keys

Tenant administrators can:
- create named API keys
- select explicit permission scopes
- view metadata without recovering the secret
- revoke keys

Properties:
- secret format uses a crmkey_ prefix
- raw key is returned only at creation
- database stores only a secure hash
- revoked or expired credentials fail authentication
- external credentials cannot use an API route unless the route declares an explicit permission
- the external credential must also contain that exact permission scope

This prevents a generic API token from inheriting the full RBAC permissions of its creator.

### OAuth client credentials

Tenant administrators can:
- create server-to-server OAuth clients
- select explicit scopes
- rotate the client secret
- revoke the client

Properties:
- client ID uses crm_client_ prefix
- client secret uses crmsecret_ prefix
- access token uses crmoauth_ prefix
- client secret is stored hashed
- access token is stored hashed
- rotating the client secret invalidates active client tokens
- revocation invalidates credentials
- token scopes are enforced by the global permission guard

This is a machine-to-machine credential flow for tenant integrations. It is not an end-user OAuth authorization-code marketplace flow.

## Outbound webhooks

Tenants can create signed webhook endpoints with:
- name
- destination URL
- event subscriptions
- active / paused state
- signing-secret rotation
- delivery history

Signing secret:
- generated as whsec_...
- returned only at creation/rotation
- encrypted at rest using AES-256-GCM
- decrypted only by the delivery worker

Webhook envelope:
- id
- type
- version
- createdAt
- data

Headers:
- x-crm-ai-event
- x-crm-ai-delivery
- x-crm-ai-signature

Signature:
- HMAC SHA-256 over the exact request body

Worker delivery guarantees:
- outbox materialization into tenant webhook deliveries
- endpoint + event idempotency
- independent delivery attempt history
- exponential retry
- retry scheduling
- endpoint failure counters
- automatic pause after repeated failures
- stale delivery-claim recovery

Production outbound network policy:
- HTTPS required
- DNS resolved at dispatch time
- loopback/private/link-local/reserved IPv4 and IPv6 ranges rejected
- webhook delivery fails closed when PLATFORM_SECRET_ENCRYPTION_KEY is absent in production

## Extension Marketplace

The marketplace supports externally integrated extensions without loading third-party runtime code into the Business OS.

A marketplace manifest declares:
- schemaVersion
- extension key
- name/version/publisher
- description/category
- required API scopes
- subscribed event types
- optional configuration schema

Provider lifecycle:
- DRAFT
- PUBLISHED
- SUSPENDED
- ARCHIVED

Tenant lifecycle:
- install
- ACTIVE
- uninstall

Installation is allowed only for published extensions.

Tenants explicitly approve requested scopes.

First-party provider extensions and third-party marketplace extensions remain separate concepts:
- provider extensions/add-ons are enabled through entitlements
- marketplace integrations are installed per tenant through the marketplace registry

## Enterprise Controls

Entitlement:
- enterprise.controls

Security policy supports:
- IP allowlist enforcement
- CIDR rules
- allowed email domains
- maximum authenticated-session age
- audit retention period
- policy configuration

The EnterpriseSecurityGuard is applied globally after authentication and before normal permission/entitlement authorization.

When Enterprise controls are enabled:
- session users can be restricted by source IP
- session users can be restricted to approved email domains
- old sessions can be rejected using organization maximum-session-age policy

API keys and OAuth credentials continue to be governed by their explicit scopes.

## OIDC SSO foundation

Enterprise organizations can configure OIDC identity connections.

Configuration stores:
- issuer
- client ID
- encrypted client secret
- allowed domains
- connection status/configuration

Security:
- OIDC client secret is AES-256-GCM encrypted at rest
- API responses never return ciphertext or raw secret
- issuer configuration requires HTTPS
- localhost and literal private/reserved issuer addresses are rejected
- discovery/metadata calls use request timeouts
- production resolved external endpoints are checked against blocked private/reserved networks
- returned issuer metadata must match the configured issuer
- authorization state is hashed and short-lived
- browser handoff code is hashed, short-lived and one-time-use

The local code path and state/session handoff are certified.

Live interoperability against a production identity provider remains an external deployment/integration validation task because it requires real provider credentials and redirect configuration.

## SCIM 2.0 provisioning

Enterprise admins can create and revoke SCIM bearer tokens.

SCIM tokens:
- raw token returned only once
- stored hashed
- expiration supported
- revocation supported
- last-used timestamp tracked
- require enterprise.controls to remain enabled

SCIM Users supports:
- create/provision user
- list/filter users
- update active/display fields
- deprovision via active=false

Enterprise allowed-email-domain policy is enforced during SCIM provisioning.

SCIM-created users do not receive arbitrary application roles automatically; role grants remain explicit.

## Secret encryption

Platform secret encryption is centralized in:
- platform/security/secret-cipher.service.ts

Algorithm:
- AES-256-GCM
- random 96-bit IV
- authentication tag
- versioned ciphertext format

Secrets covered by Phase 9:
- webhook signing secrets
- enterprise OIDC client secrets

Production requires PLATFORM_SECRET_ENCRYPTION_KEY.

## Authentication architecture

The auth layer now recognizes:
- normal user JWT/session credentials
- API keys
- OAuth client-credential access tokens
- SCIM tokens inside the SCIM boundary

External API/OAuth credentials are intentionally narrower than user sessions.

Authorization rule:
1. the route must declare a permission
2. the API/OAuth credential must contain that exact scope
3. normal tenant/resource isolation still applies

External credentials cannot use routes that have no explicit permission metadata.

## Worker expansion

The worker now handles:
- existing outbox → Redis publication
- WhatsApp campaign dispatch
- tenant outbound webhook delivery
- enterprise audit-retention maintenance

A real Postgres/Redis worker smoke uncovered and fixed a PostgreSQL type-inference bug in webhook delivery materialization. The event-type parameter is now explicitly typed consistently before JSONB subscription matching.

## Provider UI

Provider controls now include:
- organization add-ons
- extension enable/disable management
- marketplace listing administration

New tenant/operator UI:
- /developer
- /marketplace
- /enterprise
- /sso/[connectionId]
- /sso/callback

New provider UI:
- /provider/marketplace

The dashboard shows these surfaces only when their entitlement/admin visibility rules allow them.

## Database

Phase 9 migration:
- 0012_wise_rocket_racer.sql

Real PostgreSQL schema after migration:
- 115 public tables

Critical unique indexes verified on real PostgreSQL:
- developer OAuth client ID
- developer OAuth token hash
- webhook endpoint/event delivery pair
- marketplace extension key/version
- marketplace installation organization/extension
- enterprise security-policy organization singleton
- enterprise SCIM token hash

Sensitive ciphertext columns verified as text storage:
- developer_webhook_endpoints.signing_secret_ciphertext
- enterprise_identity_connections.client_secret_ciphertext

Drizzle schema generation after Phase 9 reports:
- no schema drift
- no pending generated migration

## Phase 9 end-to-end certification

The dedicated Phase 9 test certifies:

Provider controls:
- developer API entitlement initially denied
- enterprise entitlement initially denied
- provider enables core.api
- provider enables marketplace.enabled
- provider enables enterprise.controls
- provider can revoke all three again

API key lifecycle:
- create scoped key
- allowed CRM contact read succeeds
- unscoped CRM lead read denied
- developer management route denied to external credential
- revoked key rejected

OAuth lifecycle:
- create client
- issue token
- allowed scope succeeds
- unscoped route denied
- rotate client secret
- old token rejected

Webhook lifecycle:
- create webhook
- secret returned once
- list response does not expose raw/ciphertext secret
- rotate secret

Marketplace:
- provider creates draft extension
- provider publishes extension
- tenant sees published listing
- tenant installs using approved scope
- tenant uninstalls

Enterprise:
- security policy update
- invalid empty enforced IP allowlist rejected
- private/local OIDC issuer rejected
- safe HTTPS OIDC connection created without secret leakage

SCIM:
- token created
- disallowed email-domain provisioning rejected
- allowed user provisioned
- filtered user listing works
- user deactivated
- token revoked
- revoked token rejected

## Real signed webhook certification

A disposable local receiver was used against the real pgvector/Postgres + Redis stack and the compiled worker.

Result:
- outbox event materialized into webhook delivery
- exact event envelope sent
- x-crm-ai-event present
- x-crm-ai-delivery present
- HMAC signature verified true by receiver
- HTTP response 204 recorded
- delivery status DELIVERED
- delivery attempts 1
- outbox status PROCESSED

The smoke found and fixed the PostgreSQL parameter type issue before release.

## Final quality gate

Passed:
- TypeScript: API / web / worker
- lint: 0 errors, 0 warnings
- unit tests: 5/5 API tests; web/worker currently have no dedicated unit files
- end-to-end regression: 12/12
- Phase 9 dedicated developer/marketplace/enterprise scenario: PASS
- API production build
- worker production build
- Next.js production build
- dependency audit: 0 vulnerabilities
- Drizzle schema-drift check
- real PostgreSQL migration
- real Postgres schema/index verification
- real Redis/Postgres worker startup
- real signed webhook round-trip

## External production activation remaining

The following are deployment/provider tasks, not Phase 9 core-code gaps:
- configure production PLATFORM_SECRET_ENCRYPTION_KEY in the secrets manager
- configure public API/web domains
- configure real OIDC redirect URIs
- validate OIDC interoperability with each supported enterprise identity provider
- issue production SCIM endpoints/tokens to enterprise clients
- configure public webhook egress policy/networking
- production observability/alert routing
- commercial marketplace review/legal/publisher process

## Phase 9 result

The Business OS now supports three governed access planes:

1. first-party tenant application
2. provider-controlled SaaS capabilities and extensions
3. external developer/enterprise integrations through scoped APIs, webhooks, marketplace manifests, OIDC and SCIM

The core remains multi-tenant, permission-scoped, entitlement-controlled, auditable, event-driven and provider-independent.
