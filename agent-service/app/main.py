import hmac

from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel

from app.agents.api_planning import run_api_planning
from app.agents.data_discovery import AssetPick, DataDiscovery, run_data_discovery
from app.agents.intent import Filter, Intent
from app.agents.lifecycle import FindingIn, run_lifecycle
from app.config import settings
from app.graph.workflow import build_graph
from app.providers.llm import get_llm_provider
from app.registry import list_catalog

app = FastAPI(title="Agentic Data-to-API — Agent Service")
_graph = None


def _get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph(get_llm_provider())
    return _graph


def _check(token: str | None) -> None:
    # Constant-time comparison so the token cannot be guessed byte by byte from response timing.
    if token is None or not hmac.compare_digest(token.encode(), settings.internal_token.encode()):
        raise HTTPException(status_code=401, detail="bad internal token")


async def _llm_call(coro):
    """Maps LLM failures to HTTP errors the Node backend understands."""
    try:
        return await coro
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        if getattr(e, "code", None) == 429:
            raise HTTPException(status_code=429, detail="LLM quota exhausted")
        raise


@app.get("/health")
async def health():
    return {"status": "ok", "service": "agent-service", "gemini_configured": bool(settings.gemini_api_key), "groq_configured": bool(settings.grok_api_key)}


class AnalyzeRequest(BaseModel):
    request_text: str


@app.post("/analyze")
async def analyze(body: AnalyzeRequest, x_internal_token: str | None = Header(default=None)):
    """Intent + API discovery. Called only by the Node backend (which owns auth/governance)."""
    _check(x_internal_token)
    state = await _llm_call(_get_graph().ainvoke({"request_text": body.request_text}))
    d = state["discovery"]
    matched = next((a for a in state["apis"] if a["id"] == d.api_id), None)
    return {
        "intent": {**state["intent"].model_dump(exclude={"filters"}), "filters": {f.name: f.value for f in state["intent"].filters}},
        "discovery": {**d.model_dump(exclude={"params"}), "params": {p.name: p.value for p in d.params}},
        "api": {k: matched[k] for k in ("id", "name", "path", "classification")} if matched else None,
    }


class IntentIn(BaseModel):
    summary: str
    metric: str
    dimensions: list[str] = []
    filters: dict[str, str] = {}


def _to_intent(i: IntentIn) -> Intent:
    return Intent(
        summary=i.summary,
        metric=i.metric,
        dimensions=i.dimensions,
        filters=[Filter(name=k, value=v) for k, v in i.filters.items()],
    )


@app.post("/discover")
async def discover(body: IntentIn, x_internal_token: str | None = Header(default=None)):
    """Data Discovery: which catalog assets can answer the intent (no API exists)."""
    _check(x_internal_token)
    full = list_catalog()
    # A source table already loaded into the warehouse by ETL is hidden, so discovery uses the warehouse copy.
    loaded = {a["table_name"] for a in full if a["schema_name"] == "warehouse"}
    catalog = [a for a in full if a["in_warehouse"] or a["table_name"] not in loaded]
    d = await _llm_call(run_data_discovery(get_llm_provider(), _to_intent(body), catalog))
    by_key = {(a["schema_name"], a["table_name"]): a for a in catalog}
    return {
        "data_available": d.data_available,
        "missing": d.missing,
        "reasoning": d.reasoning,
        "assets": [
            {
                "id": by_key[(p.schema_name, p.table_name)]["id"],
                "schema_name": p.schema_name,
                "table_name": p.table_name,
                "columns": p.columns,
                "classification": by_key[(p.schema_name, p.table_name)]["classification"],
                "in_warehouse": by_key[(p.schema_name, p.table_name)]["in_warehouse"],
            }
            for p in d.assets
        ],
    }


class PlanRequest(BaseModel):
    intent: IntentIn
    assets: list[dict]
    problems: list[str] = []


@app.post("/plan")
async def plan(body: PlanRequest, x_internal_token: str | None = Header(default=None)):
    """API Planning: structured API/query plan for the (already governance-cleared) assets."""
    _check(x_internal_token)
    discovery = DataDiscovery(
        data_available=True,
        missing="",
        reasoning="",
        assets=[
            AssetPick(schema_name=a["schema_name"], table_name=a["table_name"], columns=a["columns"])
            for a in body.assets
        ],
    )
    p = await _llm_call(run_api_planning(get_llm_provider(), _to_intent(body.intent), discovery, list_catalog(), body.problems))
    return p.model_dump()


class LifecycleRequest(BaseModel):
    period_days: int
    findings: list[FindingIn]


@app.post("/lifecycle")
async def lifecycle(body: LifecycleRequest, x_internal_token: str | None = Header(default=None)):
    """Lifecycle Agent: wording + priority for rule-detected findings (offline report generation)."""
    _check(x_internal_token)
    report = await _llm_call(run_lifecycle(get_llm_provider(), body.period_days, body.findings))
    return report.model_dump()
