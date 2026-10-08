# VPS + Supabase Production Architecture

## Status

This is the locked initial production target for CRM-AI.

Initial launch:
- Hostinger or equivalent Ubuntu VPS for compute
- Docker Compose for web, API, worker and Redis
- Supabase PostgreSQL as the managed database
- Cloudflare for DNS, proxy, WAF and edge controls
- host Nginx as the reverse proxy

AWS remains the scale-up target. The existing Terraform/ECS/ECR architecture is intentionally retained and must not be deleted.

## Portability boundary

Application services depend only on:
- PostgreSQL through DATABASE_URL
- Redis or Valkey through REDIS_URL
- HTTP provider interfaces for Meta, OpenAI, payments and email
- environment-based configuration
- OCI/Docker images

Core application code must not depend directly on Hostinger, Supabase, ECS, ECR, RDS or ElastiCache APIs.

## Runtime layout

Public traffic:
Cloudflare -> Nginx -> web or API

Private runtime:
web -> API
API -> Supabase PostgreSQL
API -> Redis
worker -> Supabase PostgreSQL
worker -> Redis

Redis is never published to the internet. Web and API Docker ports bind to loopback only. Nginx is the only origin HTTP entry point.

## Supabase rules

The application uses Supabase as managed PostgreSQL, not as the authoritative public Data API.

For launch:
- create a dedicated CRM-AI Supabase project in ap-south-1 when available
- use SSL
- use Direct connection for persistent VPS workloads when IPv6 is available
- otherwise use Supavisor session mode on port 5432
- keep API and worker pool sizes intentionally small
- use MIGRATION_DATABASE_URL for migration and administrative database access
- disable the Supabase Data API because the NestJS API is the application security boundary
- migration 0017 additionally revokes anon/authenticated/service_role access in public as defense in depth
- keep pgvector enabled
- run Supabase security and performance advisors after applying migrations

The runtime defaults are DATABASE_POOL_MAX=8 and WORKER_DATABASE_POOL_MAX=4. Increase these only after observing database connection pressure.

## Release model

A release is an immutable Git commit SHA.

GitHub Actions:
1. checks out the requested main commit
2. builds API, web, worker and migration images
3. transfers those exact images to the VPS over verified SSH
4. transfers deployment definitions
5. runs the isolated migration image
6. starts the new application images
7. verifies API, web and worker health
8. restores the previous application image tag if health verification fails

Database migrations are not automatically rolled back. Every production migration must therefore remain backward compatible with the immediately previous application release.

## VPS filesystem

Recommended root:
- /opt/ai-crm/compose.production.yml
- /opt/ai-crm/.env.production
- /opt/ai-crm/scripts/vps/
- /opt/ai-crm/.release/
- /opt/ai-crm/backups/postgres/

The production environment file must be owned by the deployment account and mode 600.

## Reverse proxy

Use infra/vps/nginx/ai-crm.conf.template.

During final activation:
- substitute the production web and API domain names
- install the Nginx site
- obtain valid TLS certificates
- use Cloudflare Full Strict
- restrict ports 80/443 at the origin to Cloudflare address ranges before trusting CF-Connecting-IP
- keep SSH restricted to the administrator IP wherever practical

TRUST_PROXY_HOPS remains 1 because Nginx is the single trusted hop directly in front of the API and normalizes X-Forwarded-For.

## Backups

Supabase managed backups are not the only recovery layer.

The VPS includes scripts/vps/backup-postgres.sh for an independent pg_dump backup. It creates a custom-format dump, verifies that pg_restore can read the archive, writes a SHA-256 digest and applies local retention.

During external activation, configure an encrypted off-VPS destination and perform a real restore drill against a non-production database.

## Secrets

No production secret belongs in Git, a Docker image, a compose file or GitHub logs.

External activation provides:
- VPS SSH key and known-host fingerprint
- .env.production
- Supabase connection strings/passwords
- Cloudflare/domain/TLS configuration
- Meta production credentials
- OpenAI production credential
- Razorpay production credentials
- transactional email credentials

Meta, AI and payments remain disabled until those provider gates are intentionally certified.

## Scale migration

Moving to AWS later should require infrastructure changes rather than an application rewrite:
- Docker images -> ECR/ECS/Fargate
- Supabase PostgreSQL -> RDS/Aurora PostgreSQL if desired
- Redis -> ElastiCache/Valkey
- Nginx -> ALB/CloudFront/Cloudflare topology
- environment secrets -> Secrets Manager

The application interfaces remain PostgreSQL, Redis and HTTP.
