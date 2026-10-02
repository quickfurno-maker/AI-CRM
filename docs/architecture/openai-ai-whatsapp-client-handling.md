# OpenAI AI WhatsApp Client Handling Extension

## Decision

The Business OS will offer a paid **AI WhatsApp Client Handling** extension.

This extension sits above the Meta/WhatsApp communication platform and the universal CRM.

It is not a separate WhatsApp stack and does not bypass Meta rules.

Target commercial/technical path:

```
Meta Tech Provider / Tech Partner Platform
                +
OpenAI API / OpenAI Partner Network path
                ↓
AI WhatsApp Client Handling Extension
```

We may apply to the OpenAI Partner Network and pursue formal partner status, but the product must function correctly whether or not partner enrollment is approved.

Do not market the product as an "OpenAI partner" until the company has formally joined the OpenAI Partner Network.

---

## Provider Model — LOCKED

The commercial relationship is:

```
Client Business
      ↓
OUR BUSINESS OS
      ├── Meta WhatsApp Service
      └── AI Client Handling Service
              ↓
            OpenAI
```

The client buys the finished service from us.

### WhatsApp
- Client connects Meta Business Portfolio / WABA / phone through our Embedded Signup.
- Client keeps ownership of Meta assets.
- Our platform operates those assets as authorized Tech Provider / Tech Partner.
- Client does not manage Meta developer integration manually in the normal flow.

### OpenAI
- Standard plans do **not** require the client to create an OpenAI API account or paste an API key.
- Our AI Gateway calls OpenAI from platform-managed OpenAI projects/service credentials.
- We meter tenant-level AI usage internally.
- The client pays us for the AI WhatsApp extension as part of the SaaS subscription/add-on.
- We do not sell, transfer or expose OpenAI API keys or raw account access.
- Enterprise BYOK may exist later as an optional deployment model, not the default.

This is a **managed AI service powered by OpenAI APIs**, not resale of OpenAI account access.

Until formal acceptance into the OpenAI Partner Network, public wording must remain **Powered by OpenAI APIs** / **Built with OpenAI**, not **OpenAI Partner**.

---

## Product concept

Each tenant can subscribe to an AI service that handles WhatsApp client conversations on its behalf.

Typical jobs:
- greet and identify new enquiries
- answer business/service/product questions
- qualify leads
- collect required CRM fields
- detect urgency and buying intent
- recommend products/services from approved tenant knowledge
- create or update CRM contacts/leads/deals
- create tasks
- schedule appointments where enabled
- follow up within policy
- hand off to a human
- summarize the conversation for sales/support staff
- continue assisting the human after takeover
- trigger approved automations

This becomes an **AI employee / AI client-handling agent**, not a simple FAQ bot.

---

## OpenAI runtime decision

For new integrations, OpenAI's Responses API is the preferred primitive.

Our architecture uses:

```
AI Gateway
   ↓
OpenAI Provider Adapter
   ├── Responses API
   ├── Agents SDK / managed Agents capabilities where appropriate
   ├── Function tools
   ├── MCP tools where justified
   └── Tracing / observability
```

The Business OS never spreads direct OpenAI calls throughout CRM or WhatsApp code.

Provider-independent AI Gateway remains the platform boundary.

OpenAI is the primary high-capability provider for this extension.

Other providers may be added later without changing CRM, WhatsApp, policy or tool contracts.

---

## Core runtime

```
WhatsApp inbound webhook
        ↓
Meta signature verification
        ↓
WABA / Phone Number tenant routing
        ↓
Conversation Service
        ↓
AI Handling Eligibility
        ↓
Context Builder
        ├── CRM contact / lead / deal
        ├── conversation history
        ├── tenant knowledge
        ├── products / services
        ├── pricing / policies
        ├── business hours
        ├── consent state
        └── agent configuration
        ↓
AI Gateway
        ↓
OpenAI Agent Runtime
        ↓
Reasoning + Tool Requests
        ↓
Governed Tool Gateway
        ↓
Authorization / Policy / Approval
        ↓
Trusted Business Services
        ├── CRM
        ├── Appointments
        ├── Tasks
        ├── Knowledge
        ├── Templates
        ├── Automations
        └── future extension tools
        ↓
Response Composer
        ↓
Meta Messaging Guard
        ├── service window
        ├── template requirement
        ├── consent
        ├── DNC
        ├── frequency caps
        └── tenant entitlements
        ↓
WhatsApp Cloud API
```

The model never talks directly to Meta or PostgreSQL.

---

## Agent handling modes

Every conversation has an explicit mode:

```
HUMAN
AI
AI_ASSIST
```

### HUMAN
AI does not send customer-facing replies.

It may still:
- summarize
- suggest replies
- surface CRM context
- recommend next actions

### AI
The AI can reply automatically within the tenant's configured authority.

### AI_ASSIST
Human owns the conversation while AI:
- drafts replies
- summarizes
- retrieves knowledge
- recommends actions
- prepares CRM updates

This is the safest default for new tenants before full automation.

---

## AI autonomy levels

Each tool/action receives a risk level.

### L0 — Read
Examples:
- read CRM contact
- retrieve knowledge
- view pipeline
- inspect appointment availability

Auto-execute permitted.

### L1 — Low-risk internal write
Examples:
- update lead temperature
- save qualification fields
- create internal note
- create follow-up task

Can be tenant-configured for auto-execution.

### L2 — External customer action
Examples:
- send WhatsApp reply
- schedule appointment
- send approved document
- send approved template

Requires explicit tenant policy.

### L3 — Sensitive / bulk / financial
Examples:
- bulk campaign
- delete records
- change permissions
- issue financial commitments
- send regulated/sensitive content

Human approval or explicit specialized policy required.

---

## AI agent configuration

Each tenant can define one or more AI client-handling agents.

Agent configuration includes:

```
agent_id
tenant_id
workspace_id

name
role
language
tone
brand_voice

enabled_channels
handling_mode
business_hours

model_profile
prompt_version

knowledge_sources
allowed_tools
tool_permissions

autonomy_policy
approval_policy

max_response_tokens
latency_profile
monthly_budget
per_conversation_budget

handoff_rules
escalation_rules
restricted_topics

created_at
updated_at
```

A tenant can later run:
- Sales AI
- Support AI
- Reception AI
- Follow-up AI
- Real Estate AI
- Industry-specific agents

All share the same governed runtime.

---

## WhatsApp client journey example

```
Client sends WhatsApp enquiry
        ↓
Identity resolution
        ↓
Known contact?
   ├── yes → load CRM context
   └── no  → create provisional Contact
        ↓
AI greets client
        ↓
Intent detection
        ↓
Qualification
        ↓
Required information capture
        ↓
Knowledge-backed answer
        ↓
Lead create/update
        ↓
Lead scoring / temperature
        ↓
Optional appointment
        ↓
Human handoff if needed
        ↓
AI summary for operator
        ↓
Follow-up automation
```

---

## Human handoff triggers

Immediate handoff can occur when:
- customer explicitly requests a human
- complaint / escalation
- payment dispute
- legal or regulated question
- unsupported request
- repeated AI misunderstanding
- low confidence
- negative sentiment combined with risk
- high-value opportunity based on tenant policy
- requested action exceeds AI authority
- customer identity cannot be safely resolved
- tenant-defined VIP condition
- agent/provider outage

After handoff, AI must stop sending autonomous replies unless the mode is explicitly changed again.

---

## Knowledge architecture

The AI client handler may use tenant-controlled knowledge:

- website
- PDFs/documents
- FAQs
- products/services
- pricing
- policies
- locations
- availability
- CRM-approved structured data
- extension-specific information

Retrieval path:

```
Tenant Knowledge
→ Parse
→ Chunk
→ Embed
→ Tenant-filtered retrieval
→ Context Builder
→ OpenAI agent
```

Retrieved content is data, not privileged instructions.

Prompt-injection content must not override platform policy or tool authorization.

---

## OpenAI tools

The AI can request typed tools such as:

```
get_contact()
get_lead()
create_lead()
update_lead()
create_task()
get_products()
search_knowledge()
get_available_appointments()
schedule_appointment()
create_note()
request_human_handoff()
send_whatsapp_message()
send_whatsapp_template()
```

The OpenAI agent requests tool calls.

Our trusted backend:
1. authenticates tenant context
2. validates permissions
3. checks action risk
4. checks consent/policy
5. optionally requests approval
6. executes business action
7. returns a structured result to the agent

OpenAI never receives database credentials.

---

## Conversation memory

Memory is separated into:

### Live conversation context
Recent WhatsApp turns and active interaction state.

### CRM memory
Canonical structured customer/business facts.

### Durable AI memory
Only explicitly allowed derived facts/preferences.

### Tenant knowledge
Business-wide approved knowledge.

Do not treat the model transcript as the canonical CRM database.

Important business facts must be normalized into trusted CRM fields.

---

## OpenAI observability

Every AI conversation run should capture:

- tenant
- conversation ID
- agent ID/version
- prompt version
- model
- provider
- response/run ID
- tool calls requested
- tools executed
- policy decisions
- approval decisions
- handoffs
- token usage
- estimated cost
- latency
- result
- errors

OpenAI tracing/agent observability may supplement our telemetry, but our Business OS keeps its own canonical operational audit trail.

---

## Cost-aware routing

The extension must not send every message to the most expensive model.

Recommended routing:

```
Inbound event
   ↓
Deterministic fast checks
   ↓
Simple classification / extraction
   ↓
Need advanced reasoning?
   ├── no  → economical model/path
   └── yes → stronger OpenAI model
```

Possible routing criteria:
- complexity
- customer value
- escalation risk
- tool requirements
- language
- conversation length
- tenant plan
- latency requirement
- token budget

This supports thousands of conversations without uncontrolled model cost.

---

## Subscription / monetization

AI WhatsApp Client Handling is an **extension/add-on**, not a free property of every WhatsApp channel.

Example entitlement:
