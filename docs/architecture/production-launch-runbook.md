# Production Launch Runbook

## Purpose

This runbook is the operational boundary between the internally certified CRM-AI release and the third-party/account activation required for commercial production.

Do not mark production launch complete from code/CI evidence alone.

## 1. Release source

Release branch:
`feat/phase-10-11-internal-completion`

Before deployment:
- merge only after CI is green;
- deploy an immutable commit SHA;
- never deploy from an uncommitted workstation tree;
- do not enable Meta or AI live mode until the corresponding provider gate is ready.

## 2. Required production accounts / external inputs

AWS:
- production AWS account
- GitHub OIDC deployment role
- Terraform state S3 bucket
- Terraform lock table
- approved AWS region

Cloudflare:
- zone
- API token
- production web hostname
- production API hostname

Meta:
- App ID
- Graph version
- Embedded Signup configuration ID
- provider business ID
- system-user ID/token
- app secret
- webhook verification token
- approved permissions / Advanced Access

OpenAI:
- production project
- service/API credential stored in AWS Secrets Manager

Payment provider:
- production merchant account
- API credentials
- webhook signing secret
- approved currency/tax/settlement configuration

Email:
- production transactional email sender/provider for invitations and commercial notices

## 3. Infrastructure bootstrap

Create the remote Terraform state backend outside the application stack:
- versioned S3 bucket
- public-access block
- encryption
- DynamoDB lock table
- least-privilege GitHub OIDC role

Populate GitHub production environment variables/secrets required by:
`.github/workflows/deploy-production.yml`

Keep:
- `META_TRANSPORT_MODE=disabled`
- `AI_TRANSPORT_MODE=disabled`

for the first infrastructure deployment.

## 4. First infrastructure deployment

Run the production deployment workflow.

Expected order:
1. resolve immutable image tag;
2. ensure ECR repositories;
3. build/push API/web/worker/migration images;
4. apply Terraform;
5. run migration Fargate task;
6. abort if migration exits non-zero;
7. update ECS API/web/worker task definitions;
8. wait for services-stable;
9. verify API health;
10. verify web response.

Record:
- deployed SHA
- Terraform apply output
- migration task ARN
- ECS task-definition revisions
- health evidence

## 5. Database backup / restore proof

RDS backup settings are not sufficient evidence.

Required drill:
1. record current source DB identifier and timestamp;
2. create a PITR restore into an isolated temporary database;
3. allow access only from a controlled test task/security group;
4. start the API against the restored database;
5. run health and representative tenant-read checks;
6. record restore duration;
7. record data timestamp recovered;
8. destroy temporary restore resources;
9. store evidence with the release record.

Launch gate requires an actual successful restore.

## 6. Rollback proof

Application rollback:
- deploy a known-good prior task definition;
- confirm ECS deployment circuit breaker behavior;
- wait for services stable;
- confirm health.

Database rule:
- application deploys must remain backward-compatible with the immediately previous application revision whenever possible;
- destructive schema operations require a dedicated migration/rollback plan;
- never attempt to “rollback” irreversible data changes by blindly reversing SQL.

## 7. Meta activation

Only after base production health is stable.

Checklist:
- App Review complete
- Advanced Access complete
- public HTTPS webhook configured
- webhook verification passes
- webhook signature verification passes
- real Embedded Signup succeeds
- customer WABA discovered
- phone number registered
- inbound text received
- outbound text sent
- template sync/send passes
- media send/receive passes
- delivery/read callbacks recorded
- campaign respects consent/DNC/quiet-hour policy
- disconnect/revoke passes
- reconnect passes
- unknown asset fails closed

Then change production Meta transport to live and redeploy.

## 8. OpenAI / AI WhatsApp activation

Only after Meta live messaging is stable.

Checklist:
- OpenAI secret exists in Secrets Manager
- AI live transport configuration check passes
- real Responses API run succeeds
- embeddings succeed
- tenant RAG retrieval uses the expected tenant namespace
- AI qualification writes only permitted CRM fields
- L2 tool policy works
- L3 booking requires approval
- human handoff works
- tool-triggered WhatsApp send is idempotent
- final AI response is not suppressed by tool-send idempotency
- token/cost ledger records
- commercial usage ledger records
- timeout drill
- retry/backoff drill
- provider failure drill
- dead-event/reconciliation event reaches operators

Then enable the production AI WhatsApp consumer.

## 9. Payment-provider activation

The internal engine is provider neutral.

Adapter certification must prove:
- checkout session creation
- amount/currency match server-side checkout
- signature-verified webhook
- idempotent payment-success reconciliation
- duplicate payment reference rejection
- failed payment state
- renewal collection
- dunning retry
- grace period
- recovery from past-due
- restricted state after grace expiration
- entitlement restoration after successful recovery if policy permits
- SaaS invoice/receipt linkage

Do not allow a customer callback/browser redirect alone to mark an invoice paid.

## 10. Invitation email activation

Connect transactional email delivery for:
- team invitations
- invitation resend/token rotation
- subscription/payment notices where used

The application already persists the invitation lifecycle independently from the email transport.

## 11. Alerts and incident routing

Subscribe real operator receivers to the production alert topic.

Validate alerts for:
- API target 5xx
- unhealthy API/web targets
- high ECS CPU
- high RDS CPU
- low DB storage
- Redis CPU
- queue age
- DLQ messages

Application/operator dashboards should also cover:
- webhook failures
- Meta delivery failures
- AI failures/latency
- usage-reconciliation events
- ACTION_REQUIRED/dead events
- dunning/collection-required events

## 12. Final launch certification

Do not close the launch gate until evidence exists for:
- production deployment from CI/CD
- migration success
- restore drill
- rollback drill
- tenant isolation regression
- RBAC/resource-scope regression
- live Meta onboarding + messaging
- live OpenAI AI WhatsApp flow
- Real Estate AI tools
- human handoff
- SaaS payment flow
- dunning/recovery
- alerts
- external webhook egress
- dependency/security audit

## 13. External dependencies vs code defects

If a provider credential/approval/domain/account is absent, classify the item as **external activation pending**.

If the product cannot safely perform the flow after valid external configuration is present, classify it as a **code defect** and reopen the relevant release gate.

This distinction prevents production-provider paperwork from being misreported as unfinished application architecture.
