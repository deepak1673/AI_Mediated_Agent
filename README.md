# NovaMart Ask Data

**An agentic, governed platform that turns natural-language questions into reusable REST APIs over enterprise data.**

NovaMart Ask Data lets a business user ask a question in plain English — e.g. *"Show monthly revenue for enterprise customers in India"* — and have the platform check for an existing API, evaluate governance and access, generate a new reusable API when needed, and return the answer. Every generated API is registered, versioned, and available for reuse by future questions.

## How It Works

The platform follows a strict **reuse-before-creation** workflow:

1. Authenticate the user and establish identity.
2. Interpret the natural-language request.
3. Check the API Registry for an existing, suitable API.
4. If found, evaluate access and invoke it.
5. If not found, discover the required data across the enterprise catalog.
6. Evaluate data governance and access policy.
7. If access is permitted, plan and generate a new reusable REST API.
8. Validate the generated API and its execution plan.
9. Publish the API through the gateway and register it for reuse.
10. Invoke the API and return the result.
11. Route to human-in-the-loop (HITL) approval when required, resuming automatically once approved.
12. Continuously audit the API estate for unused, broken, or deprecated endpoints.

## Architecture

| Service | Stack | Responsibility |
|---|---|---|
| `frontend` | React 19, Vite, TailwindCSS | Chat-driven UI for asking questions and reviewing approvals |
| `backend` | Node.js, Express, Prisma, PostgreSQL | API Registry, Data Catalog, Governance, Audit, ETL orchestration |
| `agent-service` | Python, FastAPI | LLM-driven planning, data discovery, and API generation agents |
| `infrastructure` | Docker Compose | Local PostgreSQL instance |

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- Docker Desktop

### 1. Database

```bash
cd infrastructure
docker compose up -d
```

PostgreSQL is exposed on host port **5433**.

### 2. Backend

```bash
cd backend
cp .env.example .env    # configure DATABASE_URL and secrets
npm install
npx prisma migrate dev
npm run seed:all
npm run dev
```

Runs on **http://localhost:4000**.

### 3. Agent Service

```bash
cd agent-service
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt
cp .env.example .env    # add your LLM provider API key
./.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

Runs on **http://localhost:8000**.

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** and sign in as any demo user.

## Testing

```bash
cd backend && npm test        # unit + regression tests
cd backend && npm run e2e     # end-to-end workflow scenarios
```

## Documentation

- [`agentic_enterprise_data_to_api_implementation_plan (1).md`](./agentic_enterprise_data_to_api_implementation_plan%20(1).md) — full architecture and design blueprint
- [`PROGRESS.md`](./PROGRESS.md) — implementation status and stage history

## License

ISC

## Author

**Deepak Javaji**
