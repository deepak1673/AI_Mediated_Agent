# Agentic Enterprise Data-to-API Orchestration Platform
## End-to-End Implementation Plan

**Document status:** Implementation blueprint  
**Version:** 1.0  
**Primary goal:** Build a modular, governed, agentic platform that converts authenticated human data requests into reusable REST APIs over enterprise data.

---

# 1. Executive Summary

The system is an **Agentic Enterprise Data-to-API Orchestration Platform**.

A human user submits a natural-language request such as:

> "Show monthly revenue for enterprise customers in India."

The platform does not immediately generate SQL or create an API.

The workflow follows a strict **reuse-before-creation** strategy:

1. Authenticate the user and establish identity.
2. Understand the request.
3. Check the API Registry first.
4. If a suitable existing API exists, evaluate access and invoke it.
5. If no suitable API exists, discover the required enterprise data.
6. Evaluate governance and data access.
7. If data exists and access is allowed, plan a new reusable REST API.
8. Validate the API and its query/execution plan.
9. Publish the API through the API gateway.
10. Register the new API for future reuse.
11. Invoke it for the original request.
12. If data is missing, discover the source and ETL pipeline.
13. If human approval is required, pause through HITL and resume from the exact workflow point after approval.
14. Continuously analyze the API estate for unused, broken, dangling, outdated, or deprecated APIs.

The project is **not** intended to replace enterprise infrastructure. Existing technologies are integrated through modular interfaces and adapters.

---

# 2. Core Design Principles

## 2.1 Reuse Before Creation

The API Registry is always checked before data discovery or API generation.

```text
Natural Language Request
        ↓
Intent Understanding
        ↓
API Registry
        ↓
Existing API?
   ┌────┴────┐
  YES       NO
   ↓         ↓
Governance  Data Discovery
```

This is a fundamental business rule.

---

## 2.2 LLM Is Not the Authority for Security

Gemini can reason about the request, identify relevant resources, and create plans.

Gemini must not independently decide whether a user is authorized.

Authorization is performed by a deterministic governance/policy layer.

```text
LLM
 ↓
Requested resources
 ↓
Policy Engine
 ↓
ALLOW / HITL_REQUIRED / HARD_DENY
```

---

## 2.3 Human Approval for Sensitive Operations

Three HITL scenarios are required for V1:

1. **HITL_API_ACCESS**
   - Existing API is suitable.
   - User does not currently have access.

2. **HITL_DATA_ACCESS**
   - No suitable API exists.
   - Required data exists.
   - User does not have access to the data.

3. **HITL_ETL_EXECUTION**
   - Required data is not currently available in the warehouse.
   - A valid source and ETL pipeline exist.
   - Execution requires human approval.

HITL is a workflow state, not a chat interaction.

---

## 2.4 Modular Infrastructure

The business/application layer must depend on interfaces.

Examples:

- LLM Provider
- Data Warehouse
- API Registry
- Governance Engine
- ETL Orchestrator
- Approval Service
- Notification Service
- API Deployment Provider

The initial implementation uses specific technologies, but the core system must not become coupled to them.

---

## 2.5 Configuration-Driven API Creation

The platform should not modify the main backend source code every time it creates an API.

Instead:

```text
API Plan
   ↓
OpenAPI Contract
   ↓
Execution Plan
   ↓
Validation
   ↓
Registry
   ↓
Gateway
   ↓
Stable API Runtime
```

The generated API is represented by metadata, an approved execution plan, and an OpenAPI contract.

---

# 3. Final Technology Stack

## 3.1 Frontend

| Area | Technology |
|---|---|
| Framework | React |
| Language | TypeScript |
| Styling | Tailwind CSS |
| UI Components | Accessible component library with custom product styling |
| Charts | Recharts or equivalent |
| Data fetching | TanStack Query |
| Routing | React Router |
| Forms | React Hook Form + Zod |
| E2E | Playwright |

The UI must look like a deliberate enterprise product rather than a generic AI-generated dashboard.

---

## 3.2 Main Backend

| Area | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express |
| Language | TypeScript |
| ORM | Prisma |
| Validation | Zod |
| Logging | Pino |
| API contract | OpenAPI |
| Testing | Jest + Supertest |

Node.js is the primary platform/backend service.

---

## 3.3 Agent Service

| Area | Technology |
|---|---|
| Runtime | Python |
| API framework | FastAPI |
| Agent orchestration | LangGraph |
| LLM | Gemini 2.5 Flash |
| Gemini integration | Google GenAI SDK |
| Structured models | Pydantic |
| Database access | SQLAlchemy |
| Testing | pytest |

The Python service owns agent reasoning and LangGraph orchestration.

---

## 3.4 Database

Initial implementation:

**PostgreSQL**

Use PostgreSQL for:

- Platform metadata
- API Registry
- Data Catalog
- Mock enterprise warehouse
- Mock source systems
- HITL state
- Audit logs
- API usage
- ETL metadata

Use logical schemas initially instead of introducing multiple database servers.

Recommended schemas:

- `platform`
- `warehouse`
- `crm`
- `erp`
- `maintenance`

---

## 3.5 Authentication

**Keycloak**

Responsibilities:

- Human authentication
- Login
- Identity
- Roles
- JWT issuance
- Session management

Node.js validates the identity token and establishes the request context.

---

## 3.6 Governance

**Open Policy Agent (OPA)**

Responsibilities:

- RBAC/ABAC decisions
- Resource access
- Field-level restrictions
- Data classification rules
- API access rules
- HITL determination
- Hard-deny policies

OPA returns:

- `ALLOW`
- `HITL_REQUIRED`
- `HARD_DENY`

---

## 3.7 API Gateway

**Kong**

Responsibilities:

- Route published APIs
- Gateway policies
- Authentication integration
- Rate limiting
- API exposure
- API lifecycle support

The application owns API planning and registry metadata; Kong owns gateway-level API exposure.

---

## 3.8 ETL

**Apache Airflow**

Responsibilities:

- Source-to-warehouse pipelines
- ETL scheduling
- ETL execution
- ETL status
- Pipeline metadata

The agent does not implement ETL logic dynamically.

---

## 3.9 Cache and Events

**Redis**

Use Redis for:

- Caching
- Temporary state
- Rate limiting
- Lightweight event handling
- Background processing support

PostgreSQL remains the durable source of truth.

---

## 3.10 Observability

Use:

- OpenTelemetry
- Prometheus
- Grafana
- Structured logs

Track:

- Request latency
- Agent latency
- LLM calls
- Token usage where available
- API usage
- Governance decisions
- HITL duration
- ETL duration
- API errors
- Workflow failures

---

## 3.11 Infrastructure

Use:

- Docker
- Docker Compose for local development
- Git
- GitHub
- GitHub Actions for CI/CD

The architecture should be deployable to Kubernetes later, but Kubernetes is not required for the first implementation.

---

# 4. High-Level Architecture

```text
                         ┌──────────────────────┐
                         │      React UI        │
                         │  Enterprise Console  │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ Node.js / Express    │
                         │ TypeScript Backend    │
                         │                      │
                         │ Auth / APIs / HITL   │
                         │ Registry / Audit     │
                         │ Notifications        │
                         └──────────┬───────────┘
                                    │
                              Internal REST
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ Python Agent Service │
                         │ FastAPI + LangGraph  │
                         │                      │
                         │ Intent               │
                         │ API Discovery        │
                         │ Data Discovery       │
                         │ API Planning         │
                         │ Validation           │
                         │ Lifecycle            │
                         └──────────┬───────────┘
                                    │
             ┌──────────────────────┼─────────────────────┐
             │                      │                     │
             ▼                      ▼                     ▼
       PostgreSQL               Gemini 2.5 Flash          OPA
       Data + Metadata          Reasoning                 Governance
             │
       ┌─────┼───────────────┐
       │     │               │
       ▼     ▼               ▼
   Warehouse CRM/ERP   Maintenance
       │
       ▼
    Airflow
       │
       ▼
   ETL Pipelines

Node.js also integrates with:
- Keycloak
- Kong
- Redis
```

---

# 5. Service Responsibilities

## 5.1 React Frontend

The frontend is responsible for:

- User login
- Data request submission
- Request status
- Generated API details
- HITL approval dashboard
- API Registry
- API lifecycle dashboard
- Audit visibility
- System health
- Data catalog exploration

The frontend must not contain governance logic.

---

## 5.2 Node.js Backend

Node owns platform responsibilities:

- Authentication integration
- User context
- REST endpoints
- Request lifecycle
- HITL persistence
- API Registry access
- Audit logging
- Notification orchestration
- Kong integration
- Airflow integration
- Workflow state coordination
- API execution
- Background jobs

Node does not own free-form agent reasoning.

---

## 5.3 Python Agent Service

Python owns:

- Intent interpretation
- API semantic discovery
- Data semantic discovery
- Query planning
- API planning
- Validation reasoning
- Lifecycle analysis
- LangGraph workflow orchestration

Python should return structured results rather than unstructured text whenever possible.

---

# 6. Agent Architecture

The V1 agent set should remain small and meaningful.

## 6.1 Intent Agent

Input:

Natural-language user request.

Output:

Structured requirement:

- business intent
- requested metrics
- dimensions
- filters
- time range
- required data concepts
- possible sensitivity
- requested response shape

The agent does not authorize the request.

---

## 6.2 API Discovery Agent

This is the first major discovery agent.

Input:

Structured intent + API Registry metadata.

Output:

- matching APIs
- relevance score
- capability match
- missing parameters
- reason for match/no-match

Important:

A semantic match is not automatically an authorization decision.

---

## 6.3 Data Discovery Agent

Runs only when no suitable API exists.

Uses the Data Catalog and warehouse metadata.

Responsibilities:

- Find relevant datasets
- Identify tables
- Identify columns
- Identify relationships
- Identify classifications
- Identify possible source systems
- Determine whether required data is available

---

## 6.4 Source Discovery

Source discovery can be implemented as part of Data Discovery in V1.

It identifies:

- source system
- source table
- source ownership
- freshness
- ETL pipeline
- destination

A dedicated Source Discovery Agent can be extracted later if complexity grows.

---

## 6.5 API Planning Agent

Creates a reusable API design.

Output includes:

- API name
- method
- path
- parameters
- response schema
- data dependencies
- execution plan
- governance metadata
- ownership
- version

The API must be reusable beyond the current request.

---

## 6.6 API Validation Agent

Validates:

- OpenAPI structure
- Parameters
- SQL/query plan
- Table references
- Column references
- Joins
- Unauthorized fields
- Dangerous operations
- Data classification
- Response schema
- API naming
- Duplicate capability
- Registry conflicts

Validation should combine deterministic checks and LLM-assisted reasoning.

---

## 6.7 Lifecycle Agent

Runs offline rather than on every request.

Analyzes:

- API usage
- API health
- API dependencies
- API versions
- API age
- API ownership
- Deprecated APIs
- Unused APIs
- Broken APIs
- Dangling APIs

It produces lifecycle recommendations.

Destructive actions such as deletion should require explicit approval.

---

# 7. End-to-End Request Workflow

## Stage 1: Authentication

```text
User
 ↓
Keycloak
 ↓
JWT
 ↓
Node.js
 ↓
User Context
```

User context:

- user_id
- username
- team
- role
- scopes

---

## Stage 2: Intent Extraction

```text
User Request
 ↓
Intent Agent
 ↓
Structured Intent
```

---

## Stage 3: API Registry First

```text
Structured Intent
 ↓
API Discovery
 ↓
API Registry
```

If a suitable API exists:

```text
Existing API
 ↓
Governance
```

---

# 8. Existing API Path

## 8.1 Access Allowed

```text
API Registry
 ↓
Governance
 ↓
ALLOW
 ↓
Invoke Existing API
 ↓
Return Result
 ↓
Audit
```

---

## 8.2 Access Requires Approval

```text
API Registry
 ↓
Governance
 ↓
HITL_REQUIRED
 ↓
Create HITL Request
 ↓
Notify DWH Admin / Approver
 ↓
WAIT
```

If approved:

```text
Approval
 ↓
Resume Workflow
 ↓
Invoke API
 ↓
Notify User
 ↓
Audit
```

If rejected:

```text
Rejection
 ↓
Notify User
 ↓
Audit
```

---

## 8.3 Hard Deny

```text
Governance
 ↓
HARD_DENY
 ↓
Stop
 ↓
Audit
 ↓
Notify User
```

No HITL should be created for policies that explicitly prohibit access.

---

# 9. New API Path

If no suitable API exists:

```text
API Registry
 ↓
NO MATCH
 ↓
Data Discovery
```

If data exists:

```text
Data Discovery
 ↓
Governance
```

If allowed:

```text
ALLOW
 ↓
API Planning
 ↓
Validation
 ↓
Register
 ↓
Publish
 ↓
Invoke
```

---

# 10. Data Access HITL

If the data exists but the user does not have access:

```text
Data Discovery
 ↓
Governance
 ↓
HITL_REQUIRED
 ↓
HITL_DATA_ACCESS
 ↓
Admin Review
```

The approver may:

- Approve full requested scope
- Approve restricted scope
- Reject

If approved with restrictions, the resulting API must reflect the approved scope.

---

# 11. Missing Data + ETL Workflow

If data is not in the warehouse:

```text
API Registry
 ↓
No API
 ↓
Data Discovery
 ↓
Data Missing
 ↓
Source Discovery
 ↓
ETL Pipeline Found?
```

If no source/pipeline exists:

```text
Stop
 ↓
Notify User
 ↓
Audit
```

If a pipeline exists:

```text
ETL Pipeline Found
 ↓
HITL_ETL_EXECUTION
 ↓
Admin Approval
```

After approval:

```text
Airflow
 ↓
ETL
 ↓
Warehouse Updated
 ↓
Resume Workflow
 ↓
Governance
 ↓
API Planning
 ↓
Validation
 ↓
Register
 ↓
Publish
 ↓
Invoke
```

---

# 12. HITL State Management

HITL must persist enough information to resume the workflow.

Each HITL request should contain:

- hitl_id
- request_id
- hitl_type
- requester
- approver role
- reason
- requested resources
- requested scope
- current workflow state
- resume point
- approval status
- approval timestamp
- approver
- approval scope
- rejection reason

The workflow must never depend on in-memory state alone.

---

# 13. Data Architecture

## 13.1 Platform Schema

Core tables:

- users
- teams
- roles
- permissions
- policies
- api_registry
- api_versions
- api_dependencies
- api_usage
- data_sources
- data_assets
- data_columns
- etl_pipelines
- etl_runs
- hitl_requests
- hitl_decisions
- audit_logs
- workflow_runs

---

## 13.2 Warehouse Schema

Recommended initial warehouse:

### dim_customer

Contains:

- customer_key
- customer_id
- customer_name
- customer_type
- country
- segment
- signup_date
- email
- phone

Sensitive fields such as email and phone must have field-level classifications.

### dim_product

Contains:

- product_key
- product_id
- product_name
- category

### fact_orders

Contains:

- order_key
- order_id
- customer_key
- product_key
- order_date
- quantity
- amount
- status

### fact_payments

Contains:

- payment_key
- payment_id
- order_id
- payment_date
- amount
- payment_status

### fact_inventory

Contains:

- product_key
- warehouse_id
- snapshot_date
- quantity

---

# 14. Source Systems

## CRM

Tables:

- customers
- customer_preferences
- customer_interactions

## ERP

Tables:

- orders
- payments
- suppliers
- purchase_orders

## Maintenance

Tables:

- equipment
- maintenance_events
- technician_logs

---

# 15. Data Deliberately Missing from Warehouse

Do not put everything into the warehouse.

Keep selected datasets source-only initially:

- customer_preferences
- maintenance_events
- technician_logs

This is necessary to demonstrate the ETL/HITL workflow.

Example:

```text
maintenance.maintenance_events
        ↓
      Airflow
        ↓
warehouse.maintenance_events
```

---

# 16. Data Catalog

The Data Catalog is the metadata layer.

It should describe:

- source
- database/schema
- table
- column
- type
- description
- classification
- owner
- relationships
- freshness
- lineage
- ETL availability
- synonyms/tags

Metadata exists to make discovery fast and to constrain SQL/API generation.

The agent should not blindly inspect every table.

---

# 17. API Registry

Each registered API should include:

- api_id
- name
- version
- method
- path
- description
- semantic description
- parameters
- response schema
- execution plan
- source tables
- source columns
- classification
- owner team
- allowed roles/scopes
- status
- created_at
- last_used_at
- version
- dependencies

The registry is central to the reuse-before-creation strategy.

---

# 18. Initial Existing APIs

Seed the registry with approximately 8–12 APIs.

Examples:

- GET `/api/v1/customers`
- GET `/api/v1/customers/{id}`
- GET `/api/v1/orders`
- GET `/api/v1/orders/summary`
- GET `/api/v1/revenue`
- GET `/api/v1/products`
- GET `/api/v1/inventory`
- GET `/api/v1/support/tickets`

Intentionally do not create APIs for:

- Customer lifetime value
- Equipment maintenance history
- Regional profitability
- Customer preferences

These become test cases for API creation.

---

# 19. Lifecycle Test APIs

Seed intentionally problematic APIs.

## Unused API

No usage for a defined period.

## Broken API

Depends on a missing table or invalid dependency.

## Dangling API

References an unavailable data asset.

## Deprecated API

Older API version has a newer replacement.

The Lifecycle Agent must identify these conditions.

---

# 20. Governance Model

Use both RBAC and ABAC concepts.

Example dimensions:

- user
- team
- role
- resource
- data classification
- action
- environment
- purpose
- approval requirement

Classification levels:

- PUBLIC
- INTERNAL
- PII
- CONFIDENTIAL
- RESTRICTED
- FINANCIAL

The classification system should be simple enough for the demo but extensible.

---

# 21. SQL Generation Strategy

The LLM should not receive an unrestricted database and be allowed to generate arbitrary SQL.

Pipeline:

```text
Intent
 ↓
Relevant Metadata
 ↓
Candidate Tables
 ↓
Candidate Columns
 ↓
Governance Filter
 ↓
Query Plan
 ↓
SQL Generation
 ↓
Deterministic Validation
 ↓
Execution
```

Generated SQL should be:

- parameterized
- read-only for generated data APIs
- limited to approved tables
- limited to approved columns
- checked for valid joins
- checked against governance
- validated before execution

Do not expose an arbitrary `sql=` endpoint.

---

# 22. API Generation Strategy

The platform should generate:

1. API design
2. OpenAPI specification
3. Execution plan
4. Governance metadata
5. Registry entry

The runtime should execute approved plans.

Avoid generating arbitrary application source code for every request in V1.

A configuration-driven API runtime is easier to secure, validate, and demonstrate.

---

# 23. API Lifecycle

Every generated API follows:

```text
DESIGN
 ↓
GOVERNANCE
 ↓
VALIDATE
 ↓
REGISTER
 ↓
PUBLISH
 ↓
ACTIVE
 ↓
MONITOR
 ↓
VERSION
 ↓
DEPRECATE
 ↓
RETIRE
```

---

# 24. UI/UX Product Direction

The UI must look like a real enterprise developer/data platform.

Avoid:

- generic AI chatbot screens
- excessive gradients
- huge rounded cards everywhere
- random glowing elements
- excessive emojis
- template-like dashboard blocks
- fake "AI magic" animations
- unnecessary dark futuristic styling

The design should feel closer to a serious enterprise console.

---

# 25. UI Design System

Recommended direction:

- Clean light-first interface
- Strong typography hierarchy
- Neutral background
- One restrained accent color
- Dense but readable data tables
- Consistent spacing
- Subtle borders
- Minimal shadows
- Clear status indicators
- Professional charts
- Keyboard-accessible interactions

Use color semantically:

- Green: allowed/success
- Amber: waiting/HITL
- Red: denied/error
- Blue: informational/active

Do not use color as the only indication of status.

---

# 26. Main UI Pages

## 26.1 Overview

Show:

- Requests today
- APIs registered
- APIs generated
- HITL requests pending
- ETL jobs
- API health
- Recent activity

The overview should prioritize actionable information.

---

## 26.2 Data Request Workspace

Main user workflow:

```text
Describe what data you need
```

Example:

> Show monthly revenue for enterprise customers in India for 2025.

Display workflow progress:

```text
Intent understood
        ↓
Checking API Registry
        ↓
Discovering data
        ↓
Governance
        ↓
Planning API
        ↓
Validation
        ↓
Ready
```

Do not make it look like a chatbot.

It should feel like a **request/workflow console**.

---

# 27. Request Detail Page

Display:

- User request
- Parsed intent
- Existing API match
- Data assets discovered
- Governance decision
- HITL status
- API plan
- Validation results
- Final API
- Execution result
- Audit timeline

This page should be the main observability surface for an individual request.

---

# 28. HITL Approval Center

Admin view:

Table columns:

- Request
- Type
- Requester
- Team
- Requested resource
- Risk/classification
- Created
- Status
- Action

Detail view:

- Why approval is required
- What data/API is requested
- Requested fields
- Classification
- Proposed scope
- Approve
- Approve with restrictions
- Reject

---

# 29. API Registry UI

Display:

- API name
- Method
- Path
- Version
- Owner
- Status
- Usage
- Last used
- Data classification
- Dependencies

API detail:

- OpenAPI contract
- Parameters
- Response schema
- Data sources
- Governance
- Usage
- Health
- Versions
- Dependencies
- Lifecycle status

---

# 30. Data Catalog UI

Display:

- Source systems
- Tables
- Columns
- Descriptions
- Classification
- Owners
- Relationships
- Freshness
- ETL lineage

The UI should make the metadata concept visually obvious.

---

# 31. Lifecycle Dashboard

Show:

- Active APIs
- Unused APIs
- Broken APIs
- Dangling APIs
- Deprecated APIs
- APIs with high error rates
- APIs with missing owners

Provide explanations for lifecycle findings.

Do not automatically delete APIs.

---

# 32. Audit Explorer

Searchable audit table containing:

- timestamp
- request
- user
- action
- resource
- governance decision
- HITL decision
- API
- status

Every important action must be traceable.

---

# 33. Notifications

V1 can use email.

Events:

- HITL request created
- HITL approved
- HITL rejected
- ETL completed
- API generated
- API generation failed
- request completed
- request failed

Notification should contain a link back to the relevant UI page.

---

# 34. Example Scenarios

## Scenario A: Existing API

User:

> Show monthly revenue for India.

Flow:

```text
Intent
 ↓
API Registry
 ↓
Revenue API found
 ↓
Governance
 ↓
ALLOW
 ↓
Invoke
 ↓
Result
```

---

## Scenario B: New API, Data Available

User:

> Calculate average order value by customer segment.

Flow:

```text
Intent
 ↓
API Registry
 ↓
No suitable API
 ↓
Data Discovery
 ↓
Orders + Customers found
 ↓
Governance
 ↓
ALLOW
 ↓
API Planning
 ↓
Validation
 ↓
Register
 ↓
Publish
 ↓
Invoke
```

---

## Scenario C: Existing API Requires Approval

User:

> Give me customer email information.

Flow:

```text
API Registry
 ↓
Customer API found
 ↓
Governance
 ↓
HITL_REQUIRED
 ↓
HITL_API_ACCESS
 ↓
Admin approval
 ↓
Resume
 ↓
Invoke
```

---

## Scenario D: Data Exists but Access Requires Approval

```text
No API
 ↓
Data Discovery
 ↓
Data found
 ↓
Governance
 ↓
HITL_REQUIRED
 ↓
HITL_DATA_ACCESS
 ↓
Admin decision
 ↓
Resume or reject
```

---

## Scenario E: Data Missing

User:

> Show equipment maintenance history.

Flow:

```text
API Registry
 ↓
No API
 ↓
Data Discovery
 ↓
Warehouse missing
 ↓
Source Discovery
 ↓
Maintenance source found
 ↓
ETL pipeline found
 ↓
HITL_ETL_EXECUTION
 ↓
Admin approval
 ↓
Airflow
 ↓
Warehouse updated
 ↓
Resume
 ↓
Governance
 ↓
API Planning
 ↓
Validation
 ↓
Register
 ↓
Publish
 ↓
Invoke
```

---

# 35. Development Phases

## Phase 0 — Architecture and Contracts

Deliverables:

- Architecture document
- Repository structure
- API contracts
- Domain models
- Interface definitions
- Environment configuration
- Docker Compose plan

Do not start with agents.

---

## Phase 1 — Infrastructure

Build:

- PostgreSQL
- Redis
- Keycloak
- Node.js service
- Python service
- React application
- Docker Compose

Deliverable:

All services start locally and communicate successfully.

---

## Phase 2 — Platform Metadata

Build:

- users
- teams
- roles
- policies
- data sources
- data assets
- data columns
- API registry
- audit logs
- HITL tables
- ETL metadata

Seed realistic demo data.

---

## Phase 3 — Mock Enterprise Data

Create:

- CRM source
- ERP source
- Maintenance source
- Warehouse

Populate realistic data.

Include sensitive fields and classifications.

---

## Phase 4 — Authentication

Integrate Keycloak.

Implement:

- Login
- JWT
- User identity
- Role
- Team
- Backend authorization context

---

## Phase 5 — Governance

Integrate OPA.

Implement:

- ALLOW
- HITL_REQUIRED
- HARD_DENY

Test field-level access.

This should be completed before API generation.

---

## Phase 6 — API Registry

Implement:

- API registration
- Search
- Semantic metadata
- API lookup
- Dependency tracking
- Usage tracking
- Health status

Seed existing APIs.

---

## Phase 7 — Intent Agent

Implement structured intent extraction.

Validate every output with Pydantic.

Do not allow free-form output to flow directly into execution.

---

## Phase 8 — API Discovery Agent

Implement:

- Registry search
- Semantic matching
- Capability matching
- Missing parameter detection

Test existing API scenarios.

---

## Phase 9 — Data Discovery Agent

Implement:

- Metadata retrieval
- Candidate table discovery
- Column discovery
- Relationship discovery
- Classification awareness

The agent should operate on metadata first.

---

## Phase 10 — SQL/Query Planning

Implement:

- Query plan
- Parameter generation
- SQL generation
- Deterministic validation
- Governance filtering

Do not expose arbitrary SQL execution.

---

## Phase 11 — API Planning

Implement:

- API naming
- Method
- Path
- Parameters
- Response schema
- Execution plan
- OpenAPI generation

---

## Phase 12 — API Validation

Implement deterministic and LLM-assisted validation.

Check:

- duplicate APIs
- unauthorized fields
- invalid columns
- invalid joins
- unsafe queries
- invalid OpenAPI
- missing ownership
- governance conflicts

---

## Phase 13 — API Runtime + Kong

Implement:

- API registration
- Runtime execution
- Kong route publishing
- API invocation
- Usage tracking

---

## Phase 14 — HITL

Implement all three HITL cases:

- API access
- Data access
- ETL execution

Implement pause/resume semantics.

---

## Phase 15 — Airflow

Implement:

- ETL pipeline metadata
- ETL triggering
- ETL status
- ETL completion
- Workflow resume

Start with one meaningful pipeline:

```text
maintenance source
        ↓
Airflow
        ↓
warehouse maintenance events
```

---

## Phase 16 — Lifecycle Agent

Implement:

- Usage analysis
- Health analysis
- Dependency analysis
- Version analysis
- Deprecation detection

Create lifecycle dashboard.

---

## Phase 17 — Frontend Productization

Build polished pages:

- Overview
- Data Request
- Request Detail
- HITL Center
- API Registry
- API Detail
- Data Catalog
- Lifecycle
- Audit

Apply the design system consistently.

---

## Phase 18 — Observability

Add:

- OpenTelemetry
- Prometheus
- Grafana
- Structured logs
- Request tracing
- Agent tracing

---

## Phase 19 — Testing

Implement:

- Unit tests
- Integration tests
- Agent tests
- Governance tests
- API tests
- HITL workflow tests
- ETL workflow tests
- E2E tests

---

## Phase 20 — Demo Hardening

Prepare deterministic demo scenarios.

Every major path must work repeatedly.

Avoid relying on random LLM behavior for the final demo.

Use structured prompts, schemas, seeded data, and deterministic validation.

---

# 36. Repository Organization

The project should be separated into:

```text
frontend/
backend/
agent-service/
infrastructure/
docs/
```

The backend should be organized by responsibility:

```text
api/
application/
domain/
infrastructure/
workflows/
config/
```

The Python service should separate:

```text
agents/
workflows/
domain/
providers/
infrastructure/
api/
config/
```

Do not mix database code, LLM calls, API routes, and business rules in the same files.

---

# 37. Interface/Adapter Strategy

Core interfaces should exist for:

- LLMProvider
- DataWarehouse
- DataCatalog
- APIRegistry
- GovernanceProvider
- ETLProvider
- ApprovalProvider
- NotificationProvider
- APIGateway
- AuditRepository

Initial adapters:

```text
GeminiProvider
PostgresDataWarehouse
PostgresDataCatalog
PostgresAPIRegistry
OPAProvider
AirflowProvider
EmailNotificationProvider
KongAPIGateway
```

Later replacements should be possible without changing application workflows.

---

# 38. Environment Configuration

Configuration should determine infrastructure providers.

Examples:

- LLM provider
- LLM model
- PostgreSQL connection
- Redis connection
- OPA endpoint
- Airflow endpoint
- Kong endpoint
- Keycloak configuration
- Notification provider

Never hard-code secrets.

Use environment variables and local `.env` files that are excluded from Git.

---

# 39. Security Requirements

Minimum requirements:

- JWT authentication
- Role/team context
- OPA authorization
- Field-level data classification
- Parameterized queries
- Read-only generated data APIs
- No arbitrary SQL endpoint
- Audit logs
- Secret management
- Rate limiting
- Input validation
- Output validation
- API gateway controls
- Least privilege
- HITL for sensitive actions

---

# 40. Reliability Requirements

The workflow must handle:

- LLM failure
- API Registry failure
- PostgreSQL failure
- OPA failure
- Airflow failure
- Kong failure
- timeout
- duplicate requests
- workflow restart
- HITL delay
- partial API publication

Every external integration should have:

- timeout
- retry strategy where appropriate
- structured errors
- correlation ID
- audit record

---

# 41. Agent Reliability

Agents must not directly perform sensitive side effects.

Preferred model:

```text
Agent
 ↓
Structured Plan
 ↓
Validation
 ↓
Application Service
 ↓
External Side Effect
```

For example:

```text
Agent proposes:
"publish API"

       ↓

Backend validates:
- governance
- contract
- ownership
- dependencies

       ↓

Kong publishes
```

This keeps agents powerful but controlled.

---

# 42. Observability Model

Every request receives a correlation/request ID.

Trace:

```text
request
 ├── intent
 ├── api discovery
 ├── data discovery
 ├── governance
 ├── hitl
 ├── query planning
 ├── validation
 ├── deployment
 └── invocation
```

This should be visible in logs and the Request Detail UI.

---

# 43. Performance Strategy

The system should minimize unnecessary LLM calls.

Use:

- API Registry first
- Metadata filtering before LLM reasoning
- Structured outputs
- Cached metadata
- Cached API search results where appropriate
- Deterministic validation
- Short agent contexts
- Avoid sending full database schemas to Gemini

The Data Catalog is especially important for controlling context size.

---

# 44. Cost Strategy

Gemini 2.5 Flash is the default model.

Use LLM only where reasoning is needed.

Do not use the LLM for:

- Authentication
- Basic authorization
- Database existence checks
- Column existence checks
- API existence checks
- SQL syntax validation
- HTTP status handling
- HITL persistence

These should be deterministic.

---

# 45. Data Generation Strategy

Use fictional enterprise data.

Do not use real customer information.

Create enough data to demonstrate:

- Multiple countries
- Multiple customer types
- Multiple segments
- Multiple products
- Orders
- Payments
- Inventory
- Maintenance
- PII fields
- Different ownership
- Different classifications

Data should be scenario-driven rather than random.

---

# 46. Demo User Profiles

Create multiple users representing:

- Analytics Analyst
- Developer
- Finance Analyst
- Data Engineer
- DWH Administrator

Permissions should differ.

This allows governance and HITL scenarios to be demonstrated naturally.

---

# 47. Definition of Done

The project is considered functionally complete when all of the following work:

### Authentication

- Human can log in.
- Backend receives verified identity.

### Existing API

- Registry can find an existing API.
- Governance can allow/deny/request approval.
- Allowed API can execute.

### API Access HITL

- Request can pause.
- Admin can approve/reject.
- Workflow resumes correctly.

### New API

- No existing API triggers Data Discovery.
- Relevant data is discovered.
- Query plan is generated.
- API contract is created.
- API is validated.
- API is registered.
- API is published.
- API can be invoked.

### Data Access HITL

- Unauthorized data access creates HITL.
- Approval can restrict scope.
- Workflow respects the approved scope.

### ETL HITL

- Missing data is detected.
- Source and pipeline are discovered.
- Admin approval is requested.
- Airflow runs.
- Warehouse is updated.
- Workflow resumes.

### Lifecycle

- Unused API is detected.
- Broken API is detected.
- Dangling API is detected.
- Deprecated API is detected.

### Audit

Every significant operation is traceable.

---

# 48. Recommended Implementation Order

Do not implement agents first.

Recommended order:

```text
1. Repository + architecture
2. Docker Compose
3. PostgreSQL schema
4. Seed enterprise data
5. Node backend foundation
6. Python agent service foundation
7. Keycloak
8. OPA
9. API Registry
10. Data Catalog
11. Basic React UI
12. Intent Agent
13. API Discovery
14. Existing API execution
15. Governance
16. HITL
17. Data Discovery
18. Query planning
19. API Planning
20. Validation
21. Kong
22. Airflow
23. Missing-data workflow
24. Lifecycle Agent
25. Observability
26. E2E testing
27. UI polish
28. Demo hardening
```

This order reduces rework.

---

# 49. What We Are NOT Building

To keep the project realistic, V1 does not build:

- Custom identity provider
- Custom API gateway
- Custom ETL engine
- Custom policy engine
- Custom data warehouse engine
- Fully autonomous destructive agents
- Arbitrary code generation and execution
- Arbitrary SQL endpoint
- Coding-agent client support
- Kubernetes-first deployment
- Real enterprise-scale distributed infrastructure

The project contribution is the **agentic orchestration/control plane** that connects these systems.

---

# 50. Final Product Definition

The finished product should demonstrate:

> A human can describe the enterprise data they need in natural language. The platform first checks whether an existing governed REST API can satisfy the request. If not, it discovers the required enterprise data, evaluates governance, requests human approval when necessary, coordinates ETL when data is missing, plans and validates a reusable REST API, publishes it through an API gateway, registers it for future reuse, executes it for the user, and continuously manages the resulting API estate.

The key differentiator is not simply "an LLM generates an API."

The core system is:

**Natural Language → API Reuse → Data Discovery → Governance → HITL → ETL → API Planning → Validation → API Publication → Registry → Lifecycle Management**

with enterprise infrastructure integrated behind replaceable interfaces.


---

# 51. UI/UX Product Architecture

The frontend must be treated as a **real enterprise product**, not as a single AI chat page surrounded by generic dashboard cards.

The application should have clearly separated functional areas, dedicated navigation, purposeful information density, and consistent visual hierarchy.

The design objective is:

> **Professional enterprise data platform + developer console + analytics workspace**

It should feel like a product that an engineering/data team could actually use daily.

---

# 52. Global UI Structure

Use a persistent application shell after login:

```text
┌──────────────────────────────────────────────────────────────────┐
│ Top Bar                                                          │
│ Product | Search | Notifications | Help | User Profile           │
├──────────────┬───────────────────────────────────────────────────┤
│              │                                                   │
│ Sidebar      │                Main Content                        │
│              │                                                   │
│ Overview     │                                                   │
│ Ask Data     │                                                   │
│ My Requests  │                                                   │
│ APIs         │                                                   │
│ Data Catalog │                                                   │
│ Insights     │                                                   │
│ Approvals    │                                                   │
│ Audit        │                                                   │
│              │                                                   │
│ Admin        │                                                   │
│              │                                                   │
└──────────────┴───────────────────────────────────────────────────┘
```

The sidebar should remain stable across application pages.

The active section should be visually obvious.

Do not place every functionality on the dashboard.

Each major capability gets its own dedicated page.

---

# 53. Authentication Experience

## Login Page

The login page should be deliberately simple.

Layout:

```text
                 ┌──────────────────────────┐
                 │                          │
                 │       Product Logo        │
                 │                          │
                 │  Enterprise Data         │
                 │  Intelligence Platform   │
                 │                          │
                 │  [ Continue with SSO ]    │
                 │                          │
                 │  Secure enterprise login │
                 │                          │
                 └──────────────────────────┘
```

Use Keycloak for the actual authentication flow.

Do not build a fake username/password authentication system for the production architecture.

The login page should communicate:

- Product identity
- Enterprise security
- SSO
- Clean branding

Avoid:

- Large AI robot illustrations
- Neon gradients
- Excessive animation
- Huge marketing text
- Generic SaaS template appearance

---

# 54. Application Navigation

Primary navigation:

1. **Overview**
2. **Ask Data**
3. **My Requests**
4. **APIs**
5. **Data Catalog**
6. **Insights**
7. **Approvals**
8. **Audit**

Administrative navigation:

9. **System Health**
10. **Settings**

Not every user should see every administrative section.

Navigation should respect the user's role.

For example:

```text
Analyst
 ├── Overview
 ├── Ask Data
 ├── My Requests
 ├── APIs
 ├── Data Catalog
 └── Insights

DWH Admin
 ├── Overview
 ├── Ask Data
 ├── APIs
 ├── Data Catalog
 ├── Insights
 ├── Approvals
 ├── Audit
 └── System Health
```

---

# 55. Overview Dashboard

The dashboard should be an **analytical command center**, not a collection of random cards.

## Top Section

Display a concise welcome/context area:

```text
Good morning, Deepak

Enterprise Data Operations
Your activity, generated APIs, insights and pending actions.
```

Avoid oversized hero sections.

---

## KPI Row

Show only the most important metrics:

- Requests this period
- Successful requests
- APIs available
- APIs generated
- Pending approvals
- Data quality/health indicator

Each KPI should have:

- Current value
- Small trend indicator
- Relevant comparison
- Click-through destination

Do not use ten or fifteen KPI cards.

---

# 56. Dashboard Analytical Areas

The dashboard should contain purposeful sections.

## Request Activity

Chart:

- Requests over time
- Success/failure
- Request categories

## API Activity

Show:

- Most-used APIs
- Newly generated APIs
- API usage trend
- Error rate

## Data Access

Show:

- Frequently accessed data domains
- Governance decisions
- Approval activity

## Recent Activity

A compact chronological feed:

```text
10:42  API generated
10:31  Request completed
10:18  HITL approval required
09:57  API invoked
09:41  Data discovery completed
```

Each event should link to the relevant detail page.

---

# 57. Ask Data / Agent Workspace

This is the primary AI interaction page.

It should **not look like ChatGPT**.

The user should feel that they are submitting an enterprise data request to a governed data platform.

Recommended layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Ask Data                                                     │
│ Describe the business data you need.                         │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Show monthly revenue for enterprise customers in India  │ │
│ │ for 2025.                                                │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│              [ Analyze Request ]                             │
│                                                              │
│ Recent requests                                              │
│ Suggested requests                                           │
└──────────────────────────────────────────────────────────────┘
```

The page should support:

- Natural-language request
- Suggested examples
- Request history
- Request status
- Structured results

---

# 58. Agent Execution View

After submitting a request, transition to a dedicated **request execution workspace**.

Do not simply stream paragraphs from agents.

Show a structured workflow timeline:

```text
REQUEST
   ✓ Intent understood

API DISCOVERY
   ✓ Registry searched
   ✓ Existing API found

GOVERNANCE
   ✓ Access verified

EXECUTION
   ✓ API invoked

RESULT
   ✓ Request completed
```

For a new API:

```text
REQUEST
   ✓ Intent understood

API DISCOVERY
   ✓ No suitable API

DATA DISCOVERY
   ✓ Relevant datasets found

GOVERNANCE
   ✓ Access approved

API PLANNING
   ✓ API contract generated

VALIDATION
   ✓ Query validated
   ✓ Governance validated

PUBLICATION
   ✓ API registered
   ✓ API published

EXECUTION
   ✓ API invoked

RESULT
   ✓ Request completed
```

Each step should be expandable.

---

# 59. Agent Reasoning Panel

Users should be able to inspect **useful execution evidence**, but not raw hidden chain-of-thought.

Show structured reasoning artifacts such as:

- Intent identified
- APIs considered
- Selected API
- Data assets discovered
- Governance decision
- Approval requirement
- API plan
- Validation results

Example:

```text
API DISCOVERY

Existing API found:
GET /api/v1/revenue

Capability:
Monthly revenue aggregation

Match:
High semantic capability match

Required parameters:
country
customer_type
start_date
end_date
```

This creates transparency without exposing private chain-of-thought.

---

# 60. Request Result Page

Once execution finishes, the result should be presented as an analytical result rather than raw JSON.

For example:

```text
Monthly Revenue
India · Enterprise Customers · 2025

₹42.8M

[Revenue Trend Chart]

Month       Revenue
Jan         ₹3.1M
Feb         ₹3.4M
Mar         ₹3.7M
...
```

Depending on the response type, render:

- KPI
- Table
- Line chart
- Bar chart
- Breakdown
- Summary

The user should be able to switch between:

- Table
- Chart
- API Response
- Query/API Details

---

# 61. User Analytical Dashboard

The **Insights** section is a dedicated analytical surface for the user.

It should not be mixed into the main operational dashboard.

Purpose:

> Surface useful findings from the user's activity, enterprise data usage, generated APIs, and offline lifecycle analysis.

Sections:

## Personal Usage

- Requests over time
- Frequently used datasets
- Frequently used APIs
- Request success rate

## Data Insights

- Frequently requested metrics
- Popular business domains
- Repeated requests that could become reusable APIs

## API Insights

- APIs the user frequently uses
- Newly available APIs
- APIs approaching deprecation
- API usage changes

---

# 62. Offline Agent-Generated Reports

The Lifecycle Agent and other offline agents should generate periodic reports.

These reports should appear inside the **Insights** section.

They are not part of the synchronous request workflow.

Example:

```text
Weekly Enterprise API Intelligence
Generated: 22 Sep 2026

Highlights

12 APIs analyzed
2 unused APIs detected
1 broken dependency detected
1 deprecated API detected

Recommended attention

Customer Summary API
No usage in 90 days

Maintenance API v1
Replacement version available

Revenue API
Error rate increased 8% this week
```

The user can open the complete report.

---

# 63. Insights Report Detail

Each offline report should contain:

- Report period
- Agent that generated it
- Generation timestamp
- Scope
- Executive summary
- Key findings
- Supporting evidence
- Affected APIs/data assets
- Severity
- Recommended action
- Related resources

Do not present recommendations as automatic decisions.

Example:

```text
Finding

Customer Summary API has had no recorded usage
during the last 90 days.

Evidence:
Last invocation: 84 days ago
Owner: Analytics
Version: v2

Suggested action:
Review whether this API should remain active.
```

The final action remains with the responsible human/team.

---

# 64. Insights Center Layout

The Insights page should use a professional report-oriented layout:

```text
Insights

┌─────────────────────────────────────────────────────────────┐
│ Latest Report                                               │
│ Enterprise API Intelligence                                 │
│ Generated 22 Sep 2026                                       │
│                                                             │
│ 2 attention items     4 informational findings              │
│                                                             │
│ [View Report]                                               │
└─────────────────────────────────────────────────────────────┘

Reports
──────────────────────────────────────────────────────────────
Weekly API Intelligence              22 Sep
Data Access Trends                   20 Sep
API Health Review                    15 Sep
```

Reports should be searchable and filterable.

---

# 65. My Requests Page

Dedicated request history.

Columns:

- Request
- Submitted
- Status
- Path taken
- API used/generated
- Governance
- Duration

Filters:

- Status
- Date
- Existing API / New API
- HITL
- Failed
- Completed

Selecting a request opens the full Request Detail page.

---

# 66. API Registry Page

The API page should feel like a professional internal developer portal.

Use:

- Search
- Filters
- Status
- Owner
- Domain
- Version
- Classification
- Usage

Example:

```text
APIs

Search APIs...

[Active] [Deprecated] [Unhealthy]

Name                    Method   Version   Usage
Revenue                 GET      v1        1,284
Customer Summary        GET      v2          842
Inventory               GET      v1          731
Maintenance History     GET      v1          218
```

---

# 67. API Detail Page

The API detail page should have tabs:

```text
Overview
Contract
Parameters
Data Sources
Governance
Usage
Health
Versions
Dependencies
Audit
```

The user should be able to understand an API without navigating through unrelated pages.

---

# 68. Data Catalog Page

The Data Catalog should behave like an enterprise data browser.

Navigation:

```text
Sources
  ↓
Schemas
  ↓
Tables
  ↓
Columns
```

Table detail should show:

- Description
- Owner
- Classification
- Freshness
- Columns
- Relationships
- Lineage
- APIs using the dataset
- ETL pipeline
- Access policy

---

# 69. Approvals Page

Approvals should be a dedicated operational workspace.

Do not bury approval requests in notifications.

Display:

```text
Pending Approvals

Request                  Type               Risk       Age

Customer email access    API_ACCESS         PII        12m
Maintenance ETL          ETL_EXECUTION      Internal    4m
Customer analytics       DATA_ACCESS        Internal   28m
```

Approval detail should clearly show:

- Requester
- Business request
- Requested resources
- Classification
- Reason
- Proposed scope
- Policy triggered
- Available actions

Actions:

- Approve
- Approve with restrictions
- Reject

---

# 70. Audit Page

Audit should look like an enterprise event explorer.

Features:

- Search
- Date range
- User
- Resource
- Decision
- Event type
- Request ID

Example:

```text
Timestamp   Actor       Action            Resource       Decision
10:42       analyst01   API_INVOKE        revenue        ALLOW
10:31       admin01     HITL_APPROVE      customer.email APPROVED
10:18       system     API_GENERATE      revenue        SUCCESS
```

---

# 71. System Health Page

Administrative page.

Show health of:

- Node backend
- Agent service
- PostgreSQL
- Redis
- Keycloak
- OPA
- Kong
- Airflow

For each service:

- Status
- Latency
- Last health check
- Recent errors

Do not overload the main user dashboard with infrastructure details.

---

# 72. UI Information Architecture

Final navigation:

```text
WORKSPACE

Overview
Ask Data
My Requests
Insights

DATA & APIS

APIs
Data Catalog

OPERATIONS

Approvals
Audit

ADMINISTRATION

System Health
Settings
```

This creates clear separation between:

- User analytics
- AI/data requests
- Enterprise assets
- Operational approvals
- Administration

---

# 73. UI Responsiveness and Layout Rules

The UI must not become visually cluttered.

Rules:

1. Use a maximum content width for analytical pages.
2. Use consistent page headers.
3. Avoid more than 6–8 major visual elements in a viewport.
4. Use tabs for deep detail instead of long scrolling pages.
5. Use tables for dense operational data.
6. Use charts only when trends matter.
7. Use drawers/modals for secondary actions.
8. Use dedicated pages for major workflows.
9. Maintain consistent spacing.
10. Avoid nested cards inside cards wherever possible.

---

# 74. Visual Hierarchy

Every page should have:

```text
Page title
↓
Short description/context
↓
Primary action or primary metric
↓
Main content
↓
Supporting details
```

Avoid:

```text
20 cards
↓
random charts
↓
random buttons
↓
huge empty spaces
```

---

# 75. Enterprise Design Language

The design language should communicate:

- Trust
- Control
- Transparency
- Data quality
- Professionalism
- Operational maturity

Use restrained visual elements.

Recommended:

- neutral surfaces
- subtle borders
- compact navigation
- strong typography
- clear tables
- precise icons
- consistent status chips
- subtle transitions

Avoid excessive:

- gradients
- glassmorphism
- floating blobs
- giant rounded containers
- glowing AI effects
- animated backgrounds
- unnecessary illustrations

---

# 76. UI States

Every major page must explicitly design:

- Loading
- Empty
- Success
- Error
- Partial success
- Permission denied
- HITL waiting
- Offline/unavailable
- No search results

Example HITL state:

```text
Waiting for approval

Your request requires administrator approval
because the requested data contains restricted fields.

Requested:
Customer email

Approver:
Data Warehouse Administrator

Status:
Awaiting decision

[View Request]
```

---

# 77. Agent UI Principles

The agent interface should prioritize:

**Request → Process → Evidence → Result**

not:

**Chat → Chat → Chat → Chat**

The system should feel like an intelligent enterprise workflow engine.

The agent UI should therefore emphasize:

- structured requests
- workflow progress
- discovered resources
- governance decisions
- generated API
- result
- audit trail

rather than conversational filler.

---

# 78. Offline vs Online Agent Experiences

The product has two different agent modes.

## Online Agents

Triggered by user requests.

Examples:

- Intent Agent
- API Discovery Agent
- Data Discovery Agent
- API Planning Agent
- Validation Agent

Their output is attached to a live request.

## Offline Agents

Triggered periodically.

Examples:

- Lifecycle Agent
- API health analysis
- Usage analysis
- dependency analysis
- trend analysis

Their output becomes persistent reports in the Insights section.

This distinction should be visible in the architecture and UI.

---

# 79. Offline Report Pipeline

```text
Scheduler
    ↓
Lifecycle Agent
    ↓
Analyze API Registry
    ↓
Analyze Usage
    ↓
Analyze Dependencies
    ↓
Analyze Health
    ↓
Generate Structured Report
    ↓
Store Report
    ↓
Insights Dashboard
    ↓
User/Admin Reviews
```

The report should be persisted and versioned.

---

# 80. Report Data Model

An offline report should store:

- report_id
- report_type
- generated_at
- period_start
- period_end
- agent
- scope
- summary
- findings
- affected_resources
- severity
- evidence
- suggested_actions
- report_status

Findings should be structured so the UI can render them consistently.

---

# 81. Frontend Component Strategy

Create reusable components for:

- PageHeader
- Sidebar
- TopBar
- StatusBadge
- MetricCard
- DataTable
- EmptyState
- ErrorState
- LoadingState
- WorkflowTimeline
- RequestSummary
- AgentStep
- GovernanceDecision
- ApprovalCard
- InsightCard
- ReportCard
- ChartContainer
- APIStatus
- AuditTimeline

Avoid creating slightly different versions of the same component for every page.

---

# 82. Frontend Design Quality Gate

Before considering the UI complete, evaluate:

### Consistency

- Same spacing system
- Same typography
- Same controls
- Same status language

### Density

- No unnecessary whitespace
- No excessive card nesting
- Tables remain readable

### Navigation

- Every major function has a clear destination
- Users can return to context easily

### Feedback

- Every asynchronous operation has visible state
- Errors explain what happened
- HITL status is obvious

### Professionalism

- No generic AI template appearance
- No unnecessary decorative effects
- Strong visual hierarchy
- Consistent enterprise styling

---

# 83. Updated Product Experience

The final user experience should be:

```text
LOGIN
  ↓
OVERVIEW
  ├── Personal analytics
  ├── Recent activity
  ├── API activity
  └── Latest insights
       ↓
ASK DATA
  ↓
AGENT WORKSPACE
  ↓
REQUEST RESULT
  ↓
MY REQUESTS

Separate functional areas:

APIs
DATA CATALOG
INSIGHTS
APPROVALS
AUDIT
SYSTEM HEALTH
```

This separation is intentional.

The user should never need to understand the internal architecture just to use the product.

---

# 84. Final UI Product Definition

The frontend is not a cosmetic layer over the backend.

It is a first-class product surface with four major experiences:

### 1. Operational Dashboard

Shows the current state of enterprise data/API operations.

### 2. Agent Workspace

Lets users request data and observe the governed workflow.

### 3. Enterprise Asset Explorer

Provides APIs and Data Catalog as dedicated searchable areas.

### 4. Analytical Insights

Surfaces both user-level analytics and offline agent-generated intelligence reports.

The resulting product should feel like a **professional enterprise data platform with agentic capabilities**, rather than a chatbot with a dashboard attached.


---

# 85. POC Scope Adjustment

The first implementation is a **Proof of Concept (POC)**.

The objective is to demonstrate the core product idea convincingly without building unnecessary enterprise infrastructure.

The POC must prioritize:

1. A polished professional UI
2. A reliable end-to-end agent workflow
3. Correct API-first routing
4. Useful metadata-driven data discovery
5. Deterministic governance
6. Working HITL flows
7. Reusable API generation
8. A convincing lifecycle/insights demonstration

The POC should **not** attempt to reproduce a production enterprise platform.

---

# 86. POC Philosophy

The project should follow:

> **Simple infrastructure, strong orchestration, strong UI, meaningful agent behavior.**

Do not add a technology simply because it is common in enterprise architecture.

Every component must answer:

> "Does this materially improve the demo or the core research/project contribution?"

If not, defer it.

---

# 87. Simplified POC Technology Stack

## Frontend

Use:

- React
- TypeScript
- Tailwind CSS
- React Router
- TanStack Query
- Recharts
- A small accessible component system

No need for a large frontend architecture.

---

## Backend

Use:

- Node.js
- Express
- TypeScript
- Prisma
- Zod
- Pino

Node remains the main backend.

---

## Agent Service

Use:

- Python
- FastAPI
- LangGraph
- Pydantic
- Google GenAI SDK
- Gemini 2.5 Flash

This is the only AI reasoning service required for the POC.

---

## Database

Use:

**One PostgreSQL instance.**

Use schemas:

```text
platform
warehouse
crm
erp
maintenance
```

No need for multiple database servers.

---

## Authentication

For the first POC:

**Keycloak is optional.**

Two acceptable approaches:

### Preferred POC approach

Implement a simple local demo authentication layer in Node.js with seeded users.

The user selects/logs in as one of the predefined demo users.

Example:

```text
Analytics Analyst
Finance Analyst
Developer
Data Engineer
DWH Admin
```

The selected user establishes:

- user_id
- team
- role

This is sufficient for demonstrating governance.

### Optional upgrade

Add Keycloak after the core workflow is stable.

Do not delay the agent workflow because of authentication infrastructure.

---

# 88. Simplified Governance

OPA is optional for the first POC.

The governance layer must still be implemented as an independent interface.

Initial implementation:

```text
GovernanceService
        ↓
PostgreSQL policy tables
        ↓
Deterministic policy evaluator
        ↓
ALLOW / HITL_REQUIRED / HARD_DENY
```

Later:

```text
GovernanceService
        ↓
OPA adapter
```

This preserves modularity without adding unnecessary infrastructure.

---

# 89. Simplified API Gateway

Kong is optional for the first POC.

Instead, use the existing Node.js Express server as the **API Runtime**.

Generated APIs are registered as metadata/configuration and exposed through a controlled runtime.

Example:

```text
Generated API
    ↓
API Registry
    ↓
Node API Runtime
    ↓
PostgreSQL
```

Later:

```text
Node API Runtime
        ↓
Kong
```

The important POC functionality is:

> The system can generate, register, expose, and reuse a new REST API.

A gateway product is not required to prove that concept.

---

# 90. Simplified ETL

Airflow is optional for the POC.

Implement a simple `ETLProvider` interface.

Initial adapter:

```text
MockETLProvider
```

It should simulate:

```text
REQUESTED
   ↓
RUNNING
   ↓
VALIDATING
   ↓
COMPLETED
```

The mock ETL provider can copy selected source data into the warehouse.

Later:

```text
ETLProvider
   ↓
AirflowAdapter
```

This demonstrates the architecture without requiring Airflow infrastructure.

---

# 91. Simplified Redis

Redis is **not required initially**.

Use PostgreSQL for:

- workflow state
- HITL state
- caching where necessary
- audit
- reports

Add Redis only if the POC actually needs asynchronous/background processing or caching.

---

# 92. Simplified Observability

Do not initially build the full:

```text
OpenTelemetry
Prometheus
Grafana
```

stack.

For the POC use:

- structured Node logs
- Python logs
- request IDs
- workflow execution records
- audit table

Add full observability infrastructure later.

The UI can still show workflow timing based on persisted execution records.

---

# 93. POC Architecture

The simplified architecture becomes:

```text
                         ┌─────────────────────┐
                         │     React UI        │
                         │ Professional POC    │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Node.js + Express   │
                         │ TypeScript           │
                         │                     │
                         │ Auth                │
                         │ API Runtime         │
                         │ Registry            │
                         │ Governance           │
                         │ HITL                │
                         │ Audit               │
                         └──────────┬──────────┘
                                    │
                              Internal REST
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Python + FastAPI    │
                         │ LangGraph            │
                         │                     │
                         │ Agents              │
                         │ Gemini 2.5 Flash    │
                         └──────────┬──────────┘
                                    │
                                    ▼
                              PostgreSQL
                                    │
                 ┌──────────────────┼─────────────────┐
                 ▼                  ▼                 ▼
             platform           warehouse         sources
                                  │              crm/erp/
                                  │              maintenance
                                  ▼
                            Mock ETL Provider
```

This is enough for the initial demo.

---

# 94. What MUST Work in the POC

The following functionality is mandatory.

## 94.1 Natural Language Request

A human can enter:

> "Show monthly revenue for enterprise customers in India."

The system must process it end-to-end.

---

## 94.2 Intent Agent

Gemini should convert the request into structured intent.

Example conceptual output:

```text
metric:
  revenue

dimensions:
  month

filters:
  country = India
  customer_type = enterprise

time_range:
  2025
```

Use structured Pydantic validation.

---

# 95. Strict LLM Usage Policy

The project should use Gemini **where reasoning is actually needed**, not everywhere.

## Use Gemini for:

### 1. Intent Understanding

Natural language → structured business intent.

### 2. Semantic API Discovery

Determine whether an existing API can satisfy the intent.

### 3. Semantic Data Discovery

Interpret metadata and identify relevant datasets.

### 4. Query Planning

Determine:

- required tables
- required columns
- joins
- filters
- aggregations

### 5. API Planning

Determine:

- endpoint
- parameters
- response structure
- reusable capability

### 6. Lifecycle Analysis

Interpret usage/dependency patterns and generate human-readable findings.

---

# 96. Do NOT Use the LLM For

Do not waste LLM calls on deterministic tasks.

The following must be code/rules:

- Authentication
- User identity
- Role lookup
- Permission enforcement
- Policy evaluation
- Table existence
- Column existence
- SQL syntax validation
- Parameter validation
- API registration
- API execution
- HITL persistence
- HITL approval state
- ETL status
- HTTP routing
- Audit logging
- Basic health checks

This makes the system faster, cheaper, and easier to trust.

---

# 97. LLM Call Budget

For one normal request, target approximately:

```text
1. Intent Agent
2. API Discovery Agent
3. Data Discovery Agent       only if API miss
4. Query Planning Agent      only if new API
5. API Planning Agent         only if new API
6. Validation Agent           only where reasoning is useful
```

Do not make every node call Gemini.

The workflow should stop calling agents as soon as deterministic logic can finish the task.

---

# 98. POC Agent Set

Use only these agents initially:

## Agent 1 — Intent Agent

Always runs.

## Agent 2 — API Discovery Agent

Runs after intent.

## Agent 3 — Data Discovery Agent

Runs only if no suitable API exists.

## Agent 4 — API Planning Agent

Runs only when a new API is required.

## Agent 5 — Validation Agent

Runs before API registration/execution where reasoning is needed.

## Agent 6 — Lifecycle Agent

Runs offline and generates Insights reports.

No separate Source Discovery Agent initially.

No separate Query Agent initially.

Query planning can be part of the Data Discovery/API Planning workflow.

This keeps the agent architecture understandable.

---

# 99. POC LangGraph Workflow

Use one primary LangGraph workflow.

Conceptually:

```text
START
  ↓
Intent
  ↓
API Discovery
  ↓
Existing API?
 ┌───────┴────────┐
YES               NO
 ↓                 ↓
Governance       Data Discovery
 ↓                 ↓
Access?          Data exists?
 ┌─┴─┐          ┌────┴────┐
ALLOW HITL      YES       NO
 ↓      ↓        ↓         ↓
Invoke  Pause  Governance Source/ETL
                  ↓         ↓
                 API       HITL
                 Plan       ↓
                  ↓       ETL
               Validate    ↓
                  ↓      Resume
                Register
                  ↓
                Invoke
                  ↓
                 END
```

The important rule remains:

**API Registry is always checked before Data Discovery.**

---

# 100. POC HITL Implementation

HITL should be fully functional but simple.

Use a PostgreSQL table and React approval page.

No Slack/Teams integration initially.

Three workflows:

### API Access

```text
User
 ↓
Existing API
 ↓
No access
 ↓
HITL
 ↓
Admin UI
 ↓
Approve/Reject
 ↓
Resume
```

### Data Access

```text
User
 ↓
No API
 ↓
Data found
 ↓
No access
 ↓
HITL
 ↓
Admin UI
 ↓
Approve/Reject
 ↓
Resume
```

### ETL Execution

```text
Data missing
 ↓
ETL available
 ↓
HITL
 ↓
Admin UI
 ↓
Approve
 ↓
Mock ETL
 ↓
Resume
```

---

# 101. POC Mock ETL

The mock ETL should be intentionally simple.

Example:

```text
maintenance.maintenance_events
        ↓
MockETLProvider
        ↓
warehouse.maintenance_events
```

The UI should still show:

```text
ETL Requested
ETL Approved
ETL Running
ETL Completed
Warehouse Updated
Workflow Resumed
```

This gives the demo the appearance and semantics of a real enterprise pipeline without implementing a full ETL platform.

---

# 102. POC API Runtime

Do not dynamically generate Node source code.

Instead use a controlled runtime.

The API Registry stores:

- method
- path
- parameters
- query template
- response schema
- source tables
- governance metadata

Node executes the registered plan.

Example conceptual API:

```text
GET /api/generated/revenue
```

Parameters:

```text
country
customer_type
start_date
end_date
```

The runtime executes an approved parameterized query.

This is much safer and simpler than code generation.

---

# 103. POC API Creation Flow

```text
User Request
 ↓
No Existing API
 ↓
Data Discovery
 ↓
Governance
 ↓
API Planning Agent
 ↓
Structured API Plan
 ↓
Validation
 ↓
Store API Registry Entry
 ↓
Expose through Node Runtime
 ↓
Invoke
```

The generated API should immediately become reusable.

A second user making a similar request should be able to hit the existing API instead of generating another one.

This demonstrates the value of the API Registry.

---

# 104. POC API Registry

Seed approximately:

**6–8 existing APIs**, not 12+.

Suggested:

- customer lookup
- customer list
- orders
- revenue
- product list
- inventory
- order summary
- support tickets

Create approximately:

**3–4 intentionally missing capabilities**:

- customer lifetime value
- regional profitability
- maintenance history
- customer preferences

This is enough to demonstrate both reuse and generation.

---

# 105. POC Lifecycle Agent

Keep the lifecycle agent simple.

Seed only:

- 1 unused API
- 1 broken API
- 1 deprecated API

The offline agent analyzes them and creates a report.

Example report:

```text
API Lifecycle Review

3 findings

1 unused API
1 broken dependency
1 deprecated version

Priority attention:
Customer Summary v1

Reason:
No usage recorded during the configured analysis period.
```

The report is saved to PostgreSQL.

---

# 106. POC Insights Experience

The UI must remain polished even though the backend is simplified.

The user sees:

```text
Insights

Latest analysis
────────────────────────────────

API Lifecycle Review

3 findings
1 requires attention

[View report]
```

Opening the report provides:

- Summary
- Findings
- Evidence
- Suggested action
- Affected APIs

The offline report is a **first-class product feature**, not a debug page.

---

# 107. POC UI Priority

The project should deliberately follow:

```text
UI Quality
    +
Agent Workflow Correctness
    +
Core Functionality
    >
Infrastructure Complexity
```

Do not sacrifice UI quality because this is a POC.

Simplify infrastructure instead.

---

# 108. POC UI Pages

Only build the pages that demonstrate the product.

Required:

1. Login
2. Overview
3. Ask Data
4. Request Detail
5. My Requests
6. APIs
7. API Detail
8. Data Catalog
9. Insights
10. Insight Report
11. Approvals
12. Audit

Optional later:

- System Health
- Settings
- Advanced administration

---

# 109. POC UI Quality Requirements

Even though backend infrastructure is simplified, the UI must still have:

- polished typography
- consistent spacing
- professional navigation
- responsive layouts
- loading states
- empty states
- error states
- success states
- HITL states
- clear status badges
- useful tables
- purposeful charts
- breadcrumbs where useful
- clear page titles
- consistent actions

Do not build a single-page dashboard containing every feature.

---

# 110. POC Dashboard

The dashboard should remain compact.

Show:

### Personal activity

- Requests
- Successful requests
- APIs used
- Pending approvals

### Recent activity

A small timeline.

### Latest insight

A single highlighted offline report.

### API snapshot

- Active APIs
- Newly generated APIs
- APIs requiring attention

The dashboard should provide an overview and direct users to dedicated pages.

---

# 111. POC Ask Data Page

This is the most important page.

Layout:

```text
Ask Data

What do you need?

┌─────────────────────────────────────────────────────┐
│ Show monthly revenue for enterprise customers       │
│ in India for 2025.                                  │
└─────────────────────────────────────────────────────┘

[ Analyze Request ]

Recent requests
```

After submission:

```text
Request #REQ-1024

Intent              ✓
API Discovery       ✓
Data Discovery      ✓
Governance          ✓
API Planning        ✓
Validation          ✓
Execution           ✓

Result
```

The UI should visually communicate the workflow.

---

# 112. POC Request Detail

Use tabs:

```text
Overview
Workflow
Data
Governance
API
Result
Audit
```

This avoids a long cluttered page.

The page should answer:

> What happened to my request and why?

---

# 113. POC Agent Transparency

Expose structured artifacts:

```text
Intent
────────────────
Revenue
India
Enterprise
2025
Monthly

API Discovery
────────────────
No suitable API found

Data Discovery
────────────────
fact_orders
dim_customer

Governance
────────────────
ALLOW

API Plan
────────────────
GET /api/generated/revenue-by-segment
```

Do not expose raw model chain-of-thought.

---

# 114. POC Data Catalog

Only implement the most useful views:

```text
Data Catalog

Warehouse
  Customers
  Orders
  Payments
  Products
  Inventory

Sources
  CRM
  ERP
  Maintenance
```

Table detail:

- Description
- Columns
- Classification
- Owner
- Related APIs
- ETL status

Avoid building a full enterprise data catalog product.

---

# 115. POC API Page

Keep it focused.

API list:

```text
Revenue
Customer Lookup
Orders
Inventory
Maintenance History
```

API detail:

```text
Overview
Contract
Parameters
Data
Usage
```

Do not build a full API developer portal.

---

# 116. POC Insights Page

The Insights page should have two sections.

## User Analytics

- Request volume
- Most used APIs
- Frequently requested domains

## Agent Reports

- Latest lifecycle report
- Previous reports
- Report status
- Findings

This creates the connection between the user's activity and the platform's offline intelligence.

---

# 117. POC Approval Page

Keep approval decisions simple.

Each request should clearly answer:

```text
WHO is asking?
WHAT are they asking for?
WHY does approval exist?
WHAT data/API is affected?
WHAT classification applies?
WHAT will happen if approved?
```

Buttons:

```text
Approve
Approve with restrictions
Reject
```

---

# 118. POC Audit Page

Show only meaningful events.

Example:

```text
Request created
API registry searched
API not found
Data discovered
Governance evaluated
API generated
API registered
API invoked
Request completed
```

This is sufficient to demonstrate traceability.

---

# 119. POC Database Size

Do not create hundreds of tables.

Target approximately:

### Platform

10–12 tables

### Warehouse

5–6 tables

### Source systems

6–8 tables total

This is enough to demonstrate:

- discovery
- joins
- governance
- ETL
- API generation
- lifecycle

---

# 120. POC Seed Data

Use a fictional enterprise.

Recommended:

**NovaMart**

Seed:

- 100–500 customers
- 500–2,000 orders
- 50 products
- payment records
- inventory records
- support records
- equipment records
- maintenance records

The exact row count is less important than having data that produces convincing scenarios.

---

# 121. POC Demo Scenarios

Prepare exactly these scenarios.

## Demo 1 — Existing API

Request:

> Show monthly revenue for India.

Expected:

```text
API Registry HIT
 ↓
Governance ALLOW
 ↓
Existing API invoked
 ↓
Result
```

---

## Demo 2 — New API

Request:

> Calculate average order value by customer segment.

Expected:

```text
API Registry MISS
 ↓
Data Discovery
 ↓
Governance
 ↓
API Planning
 ↓
Validation
 ↓
New API
 ↓
Result
```

---

## Demo 3 — API Access HITL

Request:

> Give me customer email information.

Expected:

```text
API Registry
 ↓
Governance
 ↓
HITL_API_ACCESS
 ↓
Admin approves
 ↓
Resume
```

---

## Demo 4 — Data Access HITL

Request:

> Analyze restricted customer information.

Expected:

```text
Data Discovery
 ↓
Governance
 ↓
HITL_DATA_ACCESS
 ↓
Admin decision
 ↓
Resume/reject
```

---

## Demo 5 — Missing Data + ETL

Request:

> Show equipment maintenance history.

Expected:

```text
No API
 ↓
Data missing
 ↓
Source found
 ↓
ETL found
 ↓
HITL_ETL_EXECUTION
 ↓
Approve
 ↓
Mock ETL
 ↓
Resume
 ↓
Generate API
 ↓
Result
```

---

## Demo 6 — Offline Intelligence

Open:

```text
Insights
 ↓
API Lifecycle Review
```

Show:

- unused API
- broken API
- deprecated API

This demonstrates that the platform has both **online agentic workflows** and **offline intelligence**.

---

# 122. POC Development Order

Use this exact order.

## Sprint 1 — Foundation

- Repository
- Docker Compose
- PostgreSQL
- Node.js
- Python
- React
- Basic service communication

## Sprint 2 — Data + Registry

- Warehouse schema
- Source schema
- Platform metadata
- Data Catalog
- API Registry
- Seed data

## Sprint 3 — UI Foundation

Build:

- Login
- App shell
- Sidebar
- Dashboard
- Ask Data page
- Requests page

Make the UI polished before adding complex agent functionality.

## Sprint 4 — Core Agents

Implement:

- Intent
- API Discovery
- Data Discovery

Get the existing-API and no-API paths working.

## Sprint 5 — Governance + HITL

Implement:

- deterministic governance
- API access HITL
- data access HITL
- approval UI
- workflow pause/resume

## Sprint 6 — API Generation

Implement:

- API Planning
- Query planning
- Validation
- API Registry creation
- Node API Runtime

## Sprint 7 — ETL Scenario

Implement:

- Source discovery
- Mock ETL
- ETL HITL
- Workflow resume

## Sprint 8 — Lifecycle + Insights

Implement:

- Lifecycle Agent
- Report generation
- Insights page
- Report detail

## Sprint 9 — Polish

Focus heavily on:

- UI consistency
- animations/transitions where useful
- loading states
- error handling
- charts
- tables
- responsive layout
- empty states
- demo reliability

## Sprint 10 — Demo Hardening

Run all six demo scenarios repeatedly.

Fix:

- agent inconsistencies
- slow workflows
- UI clutter
- incorrect governance
- duplicate APIs
- poor error messages

---

# 123. POC Definition of Done

The POC is complete when:

### Agent

- Gemini reliably extracts intent.
- API Registry is always checked first.
- Data Discovery only runs after an API miss.
- Agents return structured outputs.
- LLM is used only where reasoning is required.

### Governance

- Decisions are deterministic.
- ALLOW works.
- HITL works.
- HARD_DENY works.

### HITL

- Admin can approve/reject.
- Workflow pauses.
- Workflow resumes correctly.

### API

- Existing API can be reused.
- New API can be generated.
- New API is registered.
- New API can be invoked.
- Generated API can be reused by a later request.

### ETL

- Missing data is detected.
- Source is discovered.
- Mock ETL can be approved and executed.
- Workflow resumes afterward.

### Lifecycle

- Offline agent generates report.
- Report appears in Insights.
- Findings link to affected APIs.

### UI

- Dedicated pages exist.
- No feature is unnecessarily crammed into the dashboard.
- Ask Data workflow is polished.
- HITL experience is clear.
- Insights reports are polished.
- Tables/charts are readable.
- Loading/error/empty states exist.
- The product does not look like a generic AI template.

---

# 124. POC vs Future Production Architecture

## POC

```text
React
Node.js
Python
LangGraph
Gemini
PostgreSQL
Mock ETL
Local Governance
Local Auth
Node API Runtime
```

## Future

```text
React
Node.js
Python
LangGraph
Gemini / Other LLM
Snowflake / BigQuery / Databricks
Airflow
OPA
Keycloak / Enterprise IdP
Kong / Apigee / Azure APIM
Redis
OpenTelemetry
Prometheus
Grafana
Kubernetes
```

The POC architecture must preserve interfaces so these future replacements are possible.

---

# 125. Final POC Strategy

The project should be presented as:

> **A working agentic control-plane prototype for governed enterprise Data-to-API orchestration.**

Do not present it as a production replacement for:

- API management
- Data warehouses
- ETL platforms
- Identity providers
- Policy engines

The technical contribution is the intelligent orchestration layer.

The demo should prove four things:

```text
1. Reuse existing APIs when possible.
2. Discover data and create APIs when necessary.
3. Stop for human approval when governance requires it.
4. Learn from the API estate through offline agent-generated insights.
```

Everything else should support these four capabilities.

---

# 126. Final Recommended POC Stack

| Layer | POC Choice | Future Replacement/Upgrade |
|---|---|---|
| UI | React + TypeScript + Tailwind | Same |
| Backend | Node.js + Express + TypeScript | Same |
| Agent API | FastAPI | Same |
| Agent orchestration | LangGraph | Same/replaceable |
| LLM | Gemini 2.5 Flash | Other provider/model |
| Database | PostgreSQL | Snowflake/BigQuery/etc. |
| ORM | Prisma | Same/replaceable |
| Python DB | SQLAlchemy | Same |
| Governance | Local deterministic policy service | OPA |
| Authentication | Local demo auth | Keycloak/enterprise IdP |
| API Gateway | Node API Runtime | Kong/Apigee/etc. |
| ETL | Mock ETL Provider | Airflow |
| Cache | PostgreSQL initially | Redis |
| Notifications | In-app UI | Email/Slack/Teams |
| Observability | Structured logs + audit | OpenTelemetry + Prometheus + Grafana |
| Deployment | Docker Compose | Kubernetes/cloud |

---

# 127. Most Important Implementation Rule

Do not confuse **POC simplicity** with **poor architecture**.

The POC should be:

**simple in infrastructure, modular in code, strict in governance, intelligent in agent behavior, and polished in UI.**

The system should avoid unnecessary enterprise complexity while preserving the core architecture needed to replace infrastructure components later.

The final balance is:

```text
                 POC

        ┌───────────────────┐
        │   PROFESSIONAL UI │
        └─────────┬─────────┘
                  │
        ┌─────────▼─────────┐
        │   NODE BACKEND    │
        └─────────┬─────────┘
                  │
        ┌─────────▼─────────┐
        │  LANGGRAPH AGENTS │
        │  + GEMINI 2.5    │
        └─────────┬─────────┘
                  │
        ┌─────────▼─────────┐
        │    GOVERNANCE     │
        │  + HITL WORKFLOW  │
        └─────────┬─────────┘
                  │
        ┌─────────▼─────────┐
        │    POSTGRESQL     │
        │ DATA + METADATA   │
        └───────────────────┘

       Simple infrastructure
               +
       Strong core workflow
               +
        Excellent UI
               =
       Convincing POC
```
