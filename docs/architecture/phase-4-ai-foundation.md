# Phase 4 — AI Foundation

## Status

Implementation checkpoint complete on branch `feat/phase-4-ai-foundation`.

Phase 4 builds a governed, tenant-safe AI platform behind an internal AI Gateway. OpenAI is the primary provider, but CRM, WhatsApp and business modules do not call OpenAI directly.

---

## Architecture

```
Business OS
  ↓
AI Gateway
  ↓
OpenAI Provider Adapter
  ↓
Versioned Agent Runtime
  ↓
Governed Tool Gateway
  ↓
Authorization / Policy / Approval
  ↓
Trusted CRM / Knowledge / Communication services
```

The model never receives:
- database credentials
- unrestricted database access
- Meta credentials
- tenant-selection authority
- direct entitlement bypass

---

## Current provider runtime

Installed:
- `@openai/agents 0.18.0`
- `openai 7.27.0`
- Zod 4.6.5

Configured platform defaults:
- fast route: `gpt-6-luna`
- reasoning route: `gpt-6.1-sol`
- embeddings: `text-embedding-3-small`

All model IDs are environment configuration and can be changed without CRM/schema redesign.

AI transport modes:
- disabled
- mock
- live

Production:
- rejects mock mode
- live mode requires `OPENAI_API_KEY`

---

## Database

Phase 4 expands the schema from 49 to **62 tables**.

Added:
- ai_agents
- ai_agent_versions
- ai_sessions
- ai_runs
- ai_tool_definitions
- ai_agent_tool_policies
- ai_tool_executions
- ai_approvals
- ai_usage_records
- ai_knowledge_bases
- ai_knowledge_documents
- ai_knowledge_chunks
- ai_evaluations

Migration:

`apps/api/drizzle/0003_fuzzy_layla_miller.sql`

The migration explicitly enables:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Knowledge embeddings use:

```
vector(1536)
```

---

## Agent lifecycle

Agents are versioned.

```
Agent
  ↓
Version 1 — DRAFT
  ↓ activate
Version 1 — ACTIVE
  ↓ create next version
Version 2 — DRAFT
  ↓ activate
Version 1 — ARCHIVED
Version 2 — ACTIVE
```

Production prompt/model behavior is never silently edited in place.

Each version stores:
- model/provider
- instructions
- prompt hash
- model settings
- knowledge policy
- guardrail policy
- approval policy
- activation state
- creator

Tool policies are copied forward from the active version when a new version is created.

---

## Governed tool registry

Current tools:

### L0
- get_contact
- search_knowledge

### L1
- create_task
- update_lead_qualification
- request_human_handoff

WhatsApp customer-facing send tools are deliberately not exposed in Phase 4. They belong to Phase 4A, where Meta policy/service-window/consent checks are mandatory.

Tool policy modes:

```
DISABLED
AUTO
APPROVAL
```

Rules:
- disabled tools are not exposed to the agent
- AUTO can execute only through the trusted backend handler
- APPROVAL creates a human approval request before execution
- L3 tools can never be configured AUTO
- every tool call has a persisted execution record
- every trusted mutation is tenant-scoped and audited

---

## AI audit identity

AI mutations use:

```
actor_type = AI_AGENT
actor_id = agent_id
```

Examples:
- AI-created CRM task
- AI-updated lead qualification
- AI-requested human handoff

They also emit business-domain outbox events.

---

## Approval workflow

```
Agent requests action
  ↓
Tool policy
  ↓
APPROVAL required
  ↓
ai_tool_execution = PENDING_APPROVAL
  ↓
ai_approval = PENDING
  ↓
Human approves / rejects
  ↓
same trusted backend handler executes or stops
```

Approval requests:
- are tenant-scoped
- expire
- cannot be decided twice
- retain arguments/risk/tool identity
- record deciding member

---

## Knowledge / RAG

Tenant knowledge uses PostgreSQL + pgvector.

Flow:

```
Approved tenant text
→ normalize
→ SHA-256 content dedupe
→ chunk
→ OpenAI embedding
→ vector(1536)
→ tenant-filtered retrieval
```

Implemented:
- knowledge bases
- manual text ingestion
- document dedupe
- chunk overlap
- embeddings
- vector search
- tenant-wide knowledge search
- embedding usage records

Mock mode uses deterministic local embeddings and cosine similarity so CI does not call OpenAI.

---

## AI runtime

A run stores:
- tenant/workspace
- session
- agent/version
- contact/conversation context
- provider/model
- input/output
- token usage
- latency
- estimated cost
- status/failure
- provider/trace fields for later live telemetry

Run states include:
- RUNNING
- COMPLETED
- WAITING_APPROVAL
- FAILED

OpenAI live execution uses the Agents SDK with:
- version instructions
- configured model
- governed function tools
- maximum-turn bound
- usage telemetry

---

## Model routing

Run routing supports:

```
AGENT_DEFAULT
FAST
REASONING
```

Current configurable defaults:
- FAST → gpt-6-luna
- REASONING → gpt-6.1-sol

The routing layer is platform-owned; business modules do not hard-code model IDs.

---

## Usage / cost telemetry

Recorded per tenant:
- provider
- model
- operation
- input tokens
- output tokens
- total tokens
- units
- estimated cost
- metadata

Operations include:
- AGENT_RUN
- EMBEDDING
- knowledge-query embeddings

Important:

Estimated provider cost is telemetry only.

Subscription billing remains driven by the SaaS entitlement/metering engine, not directly from a hard-coded OpenAI price.

---

## Evaluations

Runs support evaluation records:
- evaluator
- score
- pass/fail
- label
- details

This is the foundation for regression suites and production AI quality measurement.

---

## AI API

Protected routes under:

`/v1/ai`

Include:
- agents
- versions
- version activation
- tool definitions
- tool policies
- agent runs
- governed tool simulation
- approvals
- approval decisions
- evaluations
- usage
- knowledge bases
- knowledge ingestion
- knowledge search

---

## AI Control Center UI

Route:

`/ai-agents`

Secure BFF:

`/api/ai/[...path]`

The browser never receives the OpenAI API key.

UI includes:
- agent create/list
- version selection/activation
- tool policy matrix
- risk levels
- agent playground
- run history
- human approval queue
- knowledge base creation
- text ingestion/embedding
- retrieval testing
- usage/cost telemetry

---

## Permissions

Added:
- ai.agent.read
- ai.agent.manage
- ai.agent.run
- ai.tool.manage
- ai.approval.read
- ai.approval.decide
- ai.knowledge.read
- ai.knowledge.manage
- ai.usage.read

System Owner roles inherit them automatically.

---

## End-to-end AI gate

Phase 4 e2e verifies:

1. Tenant E creates an AI agent.
2. Tool policies are configured.
3. v1 activates.
4. Tenant F cannot run Tenant E's agent.
5. Tenant E creates a knowledge base.
6. Knowledge is ingested and embedded.
7. Retrieval returns tenant knowledge.
8. Agent run succeeds in deterministic mock mode.
9. AUTO get_contact executes immediately.
10. APPROVAL create_task does not execute immediately.
11. Approval appears in human queue.
12. Human approves it.
13. CRM task is created only after approval.
14. AI usage contains agent + embedding telemetry.
15. Run evaluation is saved.
16. v2 is created and activated.
17. v1 becomes ARCHIVED and v2 ACTIVE.

---

## Full quality gate

Passed:
- TypeScript: web/API/worker
- API lint: 0 warnings / 0 errors
- worker lint: 0 warnings / 0 errors
- React/Next lint
- unit tests: 5/5
- end-to-end scenarios: 4/4
- API production build
- worker production build
- Next.js production build
- production dependency audit: **0 vulnerabilities**

---

## Pending live OpenAI activation

Architecture is complete, but live-provider smoke testing requires:
- production OpenAI API key/project
- live model access
- live Responses/Agents run
- real embedding smoke test
- provider trace validation
- usage comparison against OpenAI dashboard
- rate-limit/retry drill
- timeout/failure drill

These are activation tasks, not reasons to weaken mock/CI coverage.

---

## Next phase

**Phase 4A — AI WhatsApp Client Handling Extension**

Target:

```
WhatsApp inbound
→ tenant conversation
→ handling mode / eligibility
→ context builder
→ CRM + knowledge
→ governed OpenAI agent
→ tool/policy/approval
→ Meta send-policy guard
→ WhatsApp reply
→ human handoff / AI-assist summary
```

Phase 4A adds customer-facing L2 messaging only behind Meta policy, consent and tenant entitlements.
