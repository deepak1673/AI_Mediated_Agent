# NovaMart Agentic Data-to-API Platform (POC)

See `agentic_enterprise_data_to_api_implementation_plan (1).md` for the full architecture doc, and `docs/` for the working build plan.

## Run it locally

1. **Postgres** (Docker Desktop must be running):
   ```
   cd infrastructure
   docker compose up -d
   ```
   Exposed on host port **5433** (5432 was already taken by a local Postgres install).

2. **Backend** (Node/Express, port 4000):
   ```
   cd backend
   cp .env.example .env   # already done; edit if needed
   npm install
   npx prisma migrate dev
   npm run seed
   npm run dev
   ```

3. **Agent service** (Python/FastAPI, port 8000):
   ```
   cd agent-service
   python -m venv .venv
   ./.venv/Scripts/pip install -r requirements.txt
   cp .env.example .env   # add your GEMINI_API_KEY here
   ./.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
   ```

4. **Frontend** (React/Vite, port 5173):
   ```
   cd frontend
   npm install
   npm run dev
   ```
   Open http://localhost:5173 — pick any demo user to sign in.

## Status

Stage 1 (foundation) complete: all three services run, demo login works end-to-end, app shell renders.
Next: Stage 2 — API Registry, Data Catalog, Governance, Audit (Node only, no agents yet).
