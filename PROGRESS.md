# Progress: Agentic Enterprise Data-to-API POC (NovaMart)

Last updated: 2026-09-24 (Stages 1-8 built; adversarial security review done and fixed). Source spec: `agentic_enterprise_data_to_api_implementation_plan (1).md`.

## Architecture as built

| Piece | Tech | Port | Role |
|---|---|---|---|
| `frontend/` | React + Vite + TS + Tailwind + React Query | 5173 | UI. Vite proxies `/api/*` to the backend. |
| `backend/` | Node + Express 5 + Prisma + pg | 4000 | Auth, API registry, governance, HITL, API runtime, ETL, audit. All JSON routes live under `/api`. |
| `agent-service/` | Python + FastAPI + LangGraph + Groq (`openai/gpt-oss-120b`; Gemini adapter kept) | 8000 | The LLM agents only. Called by the backend with an internal token. |
| `infrastructure/` | Docker Compose, PostgreSQL | 5433 | One DB, schemas: `platform`, `warehouse`, `crm`, `erp`, `maintenance`. |

Design rules followed:
- **LLM only where reasoning is needed**: Intent, API Discovery, Data Discovery, API Planning. Everything else is plain code (auth, governance, validation, SQL compile, registration, execution, HITL, ETL, audit).
- **Agents never write SQL.** They emit a structured query plan; a deterministic compiler (`backend/src/lib/queryPlan.ts`) validates it and produces parameterized SQL.
- **API Registry is always checked before data discovery.**
- The LLM sits behind an `LLMProvider` interface (`agent-service/app/providers/llm.py`), so the model can be swapped.

## Done

### Stage 1: Foundation
- Repo, Docker Compose Postgres, Node backend, Python agent-service, React app shell.
- Demo login (pick a seeded user; no Keycloak): analyst, finance analyst, developer, data engineer, DWH admin (Sam Okafor).
- Overview page, sidebar, protected routes.

### Stage 2: Data, registry, governance, HITL
- Seeded warehouse (200 customers, 50 products, 900 orders) plus CRM/ERP/maintenance source schemas.
- Data Catalog (15 assets with columns, classifications, synonyms), API Registry (7 APIs), 17 governance policies.
- Deterministic governance evaluator: `ALLOW` / `HITL_REQUIRED` / `HARD_DENY`, most specific policy wins, fails closed.
- HITL queue: requests, admin approve/reject, audited.
- Node API runtime: any registered API is served at `/api/generated/:slug` and enforces governance and HITL at call time.
- Frontend pages: API Registry, API Detail (with a "Try it" panel), Data Catalog, Catalog Detail, Approvals, Audit.

### Stage 3: Ask Data, existing-API path
- LangGraph flow Intent → API Discovery (`agent-service/app/graph/workflow.py`). The model's pick is validated against the registry, so hallucinated APIs or params are dropped.
- `POST /api/ask` returns the matched API and a `callUrl`. The **Call API** button on the Ask page hits it and shows the rows (or 202 pending approval / 403 denied).
- My Requests page.
- Provider hardening: temperature 0, retries on 5xx, waits out short 429 limits, fails fast on daily-quota exhaustion with a clear `LLM_QUOTA_EXHAUSTED` message.

### Stage 4: New-API generation
When no API exists: Data Discovery (LLM) → data-access governance (`HITL_DATA_ACCESS`) → API Planning (LLM) → deterministic validation → registration → returned like any other API.
- Validation (`backend/src/services/apiGeneration.ts`): tables and columns exist in the catalog, warehouse only, joins/filters/params consistent, aggregate/group-by rules, then a compile and a Postgres `EXPLAIN` dry-run.
- The API classification is derived from the columns actually used, not chosen by the model.
- Governance evaluates per-asset classification by the columns actually needed (non-PII columns of a PII-tagged table don't trigger PII approval).
- Identical existing plans are reused instead of duplicated.
- Compiler extended to allow ordering by a select output alias.

### Stage 5: ETL scenario
- New tables `etl_pipelines`, `etl_runs` (migration `..._etl_pipelines`); 6 seeded pipelines (`npm run seed:etl`).
- If discovery lands on a source-only table: no pipeline → `NO_DATA` (stop, audit); pipeline exists → `HITL_ETL_EXECUTION`.
- Admin approval triggers the mock ETL: copies the source table into `warehouse.*`, registers it in the catalog, and records a timeline (Requested → Approved → Running → Completed → Warehouse Updated). Re-asking resumes at discovery → governance → planning.
- `maintenance.technician_logs` deliberately has no pipeline, to demo the "no pipeline" stop.
- The Ask page shows the ETL timeline.

### Stage 6: Lifecycle Agent + Insights
- **Detection is rule-based** (`backend/src/services/lifecycle.ts`): UNUSED (no activity in the analysis period, default 30 days, `LIFECYCLE_PERIOD_DAYS`), BROKEN (a table or column in the query plan no longer exists, checked against `information_schema`), DANGLING (table not in the Data Catalog), DEPRECATED.
- **One LLM call** (Lifecycle Agent, `agent-service/app/agents/lifecycle.py`, `POST /lifecycle`) writes explanations, suggested actions, a summary and the priority API. Its wording is merged onto the rule-based findings by API + issue type, so it cannot add, drop or re-classify a finding. If the model call fails, a rule-based fallback report is still saved.
- Reports are saved to `platform.reports`. Running a review also moves ACTIVE APIs found BROKEN/DANGLING/UNUSED to that status (audited), which removes them from API discovery.
- Seeded lifecycle test APIs (`npm run seed:lifecycle`): Legacy Sales Export (unused), Supplier Scorecard (broken, missing `warehouse.dim_supplier`), Customer Summary v1 (deprecated).
- Endpoints: `GET /api/reports`, `GET /api/reports/:id`, `PATCH /api/reports/:id/status` and `POST /api/reports/lifecycle/run` (DWH_ADMIN / DATA_ENGINEER only), `GET /api/analytics/usage`.
- Frontend: **Insights** page (user analytics: request volume chart, most-used APIs, KPIs; agent reports: latest, previous, run button) and **Report detail** page (summary, priority, findings with evidence and suggested action, mark reviewed/resolved).
- Verified live: the review found exactly the 3 seeded problems with no false positives, picked Supplier Scorecard as the priority, updated statuses, and returned 403 to an analyst.

### Stage 7: Overview, hardening, verification
- **Overview dashboard** (`GET /api/overview`): my request counts, approvals to review (admin), API health by status, latest lifecycle report, recent activity, and an "Approved, ready to resume" panel.
- **Lifecycle recovery:** APIs marked BROKEN/UNUSED return to ACTIVE when a later review finds them healthy, or when they are called again.
- **Access-control fixes found while testing:** `/api/audit` now shows non-admins only their own events (admins and data engineers see all); `/api/hitl/:id` is readable only by the requester or an admin; the `/api/ask` error handler can no longer itself cause a 500.
- **Discovery fix:** the model no longer sees the `metric` label when matching APIs. That label (e.g. `customer_count` on a list API) made it reject the right API and generate a duplicate.
- **Demo reset:** `npm run demo:reset` removes generated APIs, requests, approvals, ETL runs (and the tables they loaded), reports and audit history, and restores the seeded and lifecycle-test APIs.
- **End-to-end runner:** `npm run demo:reset && npm run e2e` (backend `scripts/e2e.ts`). Logs in as analyst / developer / finance / admin and checks 18 scenarios against the live stack and real LLM: health, auth (401), validation (400), role restrictions (403), SQL injection in API params, existing API allowed, API needing approval (202 → approve → 200), standing team access, new API without approval and its reuse, financial data approval → resume → new API → API approval, admin rejection, ETL approval → mock ETL → resume, no ETL pipeline, nonsense input, prompt injection for PII, very long input, lifecycle findings, overview/analytics/audit. Do not edit backend source while it runs (the dev server restarts).
- **Unit tests:** 14 backend (vitest: query-plan compiler, governance) and 12 agent-service (`.venv/Scripts/python -m unittest discover -s tests`, fake LLM: discovery shortlist and second check, hallucination filtering, data discovery validation).
- Frontend production build (`npm run build`) succeeds.

### Stage 8: Adversarial security review and fixes
An adversarial review (Saboteur / New Hire / Security Auditor personas) found the issues below; each was reproduced or code-confirmed, then fixed and covered by a test.
- **C1 approval escalation (fixed).** Approvals are now scoped to the exact *columns* requested (`assetKey` and `requestedResource.assets[].columns`). `coveredByDataApproval` (`apiRuntime.ts`) covers an API only if every sensitive column it reads (beyond PUBLIC/INTERNAL) was named in one of that user's approved requests; PII, FINANCIAL and CONFIDENTIAL are separate categories, never ranked equal. `validatePlan(plan, cleared)` accepts only the columns data discovery named, so a plan cannot pull in an uncleared column that merely exists in the catalog.
- **C2 cross-user leak on Overview (fixed).** Recent activity is scoped to the caller unless the caller is an admin; `/api/audit` and `/api/hitl/:id` were scoped earlier.
- **C3 demo sign-in (guarded, not removed).** Login is name-picking with no password, by design for the POC. With `NODE_ENV=production` the backend now refuses to start unless `SESSION_SECRET` and `INTERNAL_TOKEN` are set and `DEMO_AUTH=true` acknowledges the demo login. Real authentication is still to do for any real deployment.
- **W1** BROKEN APIs return a clean `503 API_UNAVAILABLE`; DEPRECATED ones send `Deprecation`/`Warning` headers; a global JSON error handler means no stack traces or SQL errors reach clients.
- **W2** Approval decisions are an atomic `PENDING` to decided transition (no double decision, no double ETL); find-or-create of pending approvals, ETL requests and API registration is serialized with a keyed lock (single process).
- **W3** ETL runs claim `APPROVED` to `RUNNING` atomically, and a run with no progress for `ETL_STALE_MINUTES` (default 5) is failed so the user is never stuck.
- **W4** Agent calls time out (`AGENT_TIMEOUT_MS`, default 180s), the DB pool has a `statement_timeout` (`STATEMENT_TIMEOUT_MS`, default 15s), and joins must be on matching key columns.
- **W5** `/api/ask` is rate limited per user (`ASK_RATE_PER_MIN`, default 12).
- **W6** Query parameters use own properties only (a parameter named `constructor` or `toString` can no longer resolve to an inherited function).
- **W7** The agent-service compares its internal token in constant time.
- **Groq fallback model:** when `gpt-oss-120b` hits its daily token cap, calls fall back to `openai/gpt-oss-20b` (`GROQ_FALLBACK_MODEL`).
- **Scheduled lifecycle runs:** `LIFECYCLE_INTERVAL_HOURS` (default 24, 0 disables).
- **Request Detail page:** `/requests/:id` shows the full agent reasoning, ETL timeline and Call API button for any past request.
- **Double approval removed:** a user's approved data-access request now covers the API generated from that data (column-scoped, see C1).
- Tests added: 15 backend (approval scope, cleared columns, lock, rate limit, parameter handling), 11 frontend (vitest + Testing Library).

Known remaining from the review (not fixed): the catalog and every API's query plan are readable by any signed-in user; `CREATE TABLE IF NOT EXISTS` in the mock ETL silently no-ops if a warehouse table of that name exists and never refreshes stale data; `ask.ts` is a large orchestration route worth extracting into a service; locks are in-process only (single backend instance).

### Quality
- 40 backend tests (vitest), 12 agent-service tests (unittest, fake LLM), 11 frontend tests (vitest + Testing Library) and a 21-scenario e2e runner.
- Backend and frontend both typecheck clean.
- Secrets (`.env`, API key) are gitignored; `*.log` ignored at the root.

## Verified vs not yet verified

Verified live:
- Ask → existing API → Call API returns rows (customers in India).
- Ask with no API → `NO_API` (before Stage 4) and the full generation path: discovery → data HITL → approve → plan → validate → register → call returns aggregated revenue by region.
- ETL gate logic: no-pipeline stop, idempotent approval requests, approve → ETL → catalog updated (then reset).

Verified live on Groq after the provider switch:
- Full ETL scenario: "Show me the maintenance history of our equipment" → source-only data → ETL approval → admin approves → mock ETL (80 rows, full timeline, catalog updated) → discovery on `warehouse.maintenance_events` → plan → validate → register → Call API returns rows.
- Reuse: repeating that question and the customer-lifetime-value question returns the existing generated APIs (`generated` not set, still 9 APIs, no duplicates).

Still not verified:
- The updated Ask Data page in a real browser (Chrome extension wasn't connected). API-level behaviour is verified; the UI rendering is only typechecked.

## To do

- **Look at the pages in a browser.** The Chrome extension was never connected, so every page is typechecked, production-built, unit-tested and API-tested but not visually inspected.
- **Real authentication** (see C3) before any non-local deployment.
- **Polish:** responsive layout checks, transitions, table sorting and pagination, richer charts.
- **Browser-driven UI tests** (the frontend tests are component-level).
- **Repeat the e2e run** a few times under different rate-limit conditions; LLM variance is reduced but not gone.

### Known limitations and decisions to make
- **One approval for a generated API:** the data-access approval also covers the generated API when its sensitive columns are all inside what was approved (see C1). A user without their own approval is still gated.
- **HITL resume is retry-based:** after approval the user re-asks. The plan's LangGraph checkpointer pause/resume (`langgraph-checkpoint-postgres` is installed, unused) is not wired in.
- **LLM provider:** the agent-service auto-selects Groq when `GROK_API_KEY` (a Groq `gsk_` key) is set, else Gemini (`LLM_PROVIDER=groq|gemini` overrides). Groq free tier for `gpt-oss-120b` is 8,000 tokens/min and 1,000 requests/day, so bursts wait up to 45s; prompts are kept compact. Gemini free tier is 5 req/min and a small daily cap.
- **Discovery non-determinism (mitigated):** the model sometimes said "no API" when one existed, which created near-duplicate APIs. API Discovery now does a deterministic keyword shortlist and a focused second model check over just the close candidates whenever the first pass says "no API" (`agent-service/app/agents/api_discovery.py`). The second-check prompt refuses matches that only share an entity word (e.g. "customer"). Remaining: when two existing APIs both fit, the model may pick the less precise one.
- **Plan repair:** if the planning agent proposes an invalid plan (e.g. an invented column), the validation errors are fed back once for a corrected plan before the request fails (`backend/src/routes/ask.ts`).
- **My Requests:** an approval now updates the linked request, and approved / waiting requests get a Resume / Check again button that re-runs the question.
- Dev-only defaults: `SESSION_SECRET` and `INTERNAL_TOKEN` fall back to dev values. Set real ones outside local dev.
- Repo has no commits yet, so `/ultrareview` and diff-based review can't run until the first commit.

## Running it locally

```bash
docker compose -f infrastructure/docker-compose.yml up -d          # Postgres on :5433
cd backend && npm install && npm run seed:all && npm run dev       # :4000
cd agent-service && .venv/Scripts/python -m uvicorn app.main:app --port 8000   # needs GROK_API_KEY (Groq) or GEMINI_API_KEY in .env
cd frontend && npm install && npm run dev                          # :5173
```

Demo users: sign in as Priya (analyst) to ask questions; sign in as Sam Okafor (DWH admin) to approve requests.
