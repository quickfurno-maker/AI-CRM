# Production infrastructure

This stack is the Phase 10A production baseline for CRM-AI.

## Topology

- Cloudflare proxied DNS for the web and API hostnames.
- AWS ALB with ACM TLS; HTTP redirects to HTTPS.
- Two-AZ VPC with public ALB subnets, private application subnets and isolated data subnets.
- ECS/Fargate services for web, API and worker with deployment circuit-breaker rollback.
- Private Cloud Map discovery from web to API.
- Multi-AZ PostgreSQL with encryption, 35-day backups, deletion protection and Performance Insights.
- Multi-AZ encrypted Redis.
- KMS-encrypted Secrets Manager values for database URL, JWT secret and platform encryption key.
- KMS-encrypted object storage and SQS/DLQ foundations.
- CloudWatch log groups and ECS Container Insights.
- CPU target-tracking for API and web.

## State

Use a separately bootstrapped S3 state bucket and DynamoDB lock table. Never keep production state locally.

```bash
terraform init -backend-config=backend.hcl
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

The backend bucket must have versioning, public access blocking, KMS encryption and a restrictive IAM policy.

## Secrets

Terraform creates the three core runtime secrets. Their generated values are sensitive and therefore also exist in encrypted Terraform state; restrict state access to the deployment role only.

OpenAI and Meta are intentionally external inputs:
- set `openai_api_key_secret_arn` only when production AI is approved;
- set `meta_runtime_secret_arn` only when Meta live activation is approved;
- keep both transports `disabled` until their Phase 10B/10C certification gates are ready.

The Meta secret may be a JSON Secrets Manager secret with keys:
`META_APP_SECRET`, `META_SYSTEM_USER_ACCESS_TOKEN`, and `META_WEBHOOK_VERIFY_TOKEN`.

## Database migration

Build `apps/api/Dockerfile.migrate` as a separate immutable image. Run the emitted migration task definition once before updating application services. Abort the deployment if the migration task does not exit successfully.

## Cloudflare

Use Full (strict) TLS mode. The stack creates ACM validation records and proxied application DNS records. Do not disable origin certificate validation.

## Restore proof

Before launch, perform a real RDS point-in-time restore into an isolated subnet group, run the API health check against it, record elapsed restore time, then destroy the drill copy. A successful backup setting alone is not restore proof.

## Activation boundary

This stack is production-capable infrastructure, not evidence that external services are activated. Meta App Review, real WABA onboarding, OpenAI live credentials, payment-gateway credentials, customer email delivery and production alert receivers remain explicit external activation gates.
