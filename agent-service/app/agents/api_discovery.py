"""API Discovery Agent (doc §98, Agent 2): can an existing registered API satisfy the intent?

The LLM only chooses; the result is validated deterministically against the registry so a
hallucinated API id or parameter can never reach execution."""

from __future__ import annotations

import json
import re

from pydantic import BaseModel, Field

from app.agents.intent import Filter, Intent
from app.providers.llm import LLMProvider

SYSTEM_PROMPT = """You match a structured data request to an existing API from a registry.
Pick an API only if it genuinely returns the requested data. If none fits, return api_id null.
Decide from what the API returns, as stated in its name and description. An API that lists
records satisfies a request to list/show/get those records (or to see them for a filter), and a filter the
API supports by parameter is satisfied. Do not reject an API because the request is phrased as a count or
list differently from the API name; reject it only if the requested data or breakdown is truly absent.
Never invent an api_id. Fill `params` only with parameter names the chosen API declares,
using the filter values from the intent."""


class DiscoveryChoice(BaseModel):
    api_id: str | None = Field(description="id of the matching API, or null if none fits")
    params: list[Filter] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    reasoning: str


def _catalog_for_prompt(apis: list[dict]) -> str:
    return json.dumps(
        [
            {
                "id": a["id"],
                "name": a["name"],
                "description": a["description"],
                "dimensions": a["dimensions"],
                "parameters": [p["name"] for p in a["parameters"]],
            }
            for a in apis
        ],
        separators=(",", ":"),
    )


_GENERIC = {"list", "by", "of", "the", "and", "for", "data", "api", "all", "summary", "show", "get", "me", "in", "a"}


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[a-z]+", text.lower().replace("_", " "))
    return {w[:-1] if len(w) > 3 and w.endswith("s") else w for w in words} - _GENERIC


def shortlist(intent: Intent, apis: list[dict], limit: int = 3, min_score: float = 0.5) -> list[dict]:
    """Deterministic keyword shortlist: APIs whose name terms mostly appear in the request."""
    wanted = _tokens(" ".join([intent.summary, intent.metric, *intent.dimensions]))
    scored: list[tuple[float, dict]] = []
    for api in apis:
        core = _tokens(api["name"])
        if not core:
            continue
        score = len(core & wanted) / len(core)
        if score >= min_score:
            scored.append((score, api))
    scored.sort(key=lambda t: -t[0])
    return [a for _, a in scored[:limit]]


async def run_api_discovery_with_recheck(llm: LLMProvider, intent: Intent, apis: list[dict]) -> DiscoveryChoice:
    """Model picks from the full registry. If it says "no API", code shortlists close candidates by keyword
    and the model is asked again over just those, which is far less error-prone than scanning everything."""
    choice = await run_api_discovery(llm, intent, apis)
    if choice.api_id is not None:
        return choice
    candidates = shortlist(intent, apis)
    if not candidates:
        return choice
    second = await run_api_discovery(llm, intent, candidates, hint=True)
    if second.api_id is not None:
        second.reasoning = f"(second check over keyword-matched candidates) {second.reasoning}"
        return second
    return choice


async def run_api_discovery(llm: LLMProvider, intent: Intent, apis: list[dict], hint: bool = False) -> DiscoveryChoice:
    extra = (
        "\n\nThese APIs were shortlisted because their names share terms with the request. "
        "Choose one only if it truly returns the requested measure and breakdown. Sharing an entity word "
        "(for example \"customer\" or \"order\") is NOT enough; if the requested metric or field is not "
        "in the API's description, return null."
        if hint
        else ""
    )
    choice = await llm.generate_structured(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=f"Intent:\n{intent.model_dump_json()}\n\nAPI registry:\n{_catalog_for_prompt(apis)}{extra}",
        response_model=DiscoveryChoice,
    )
    by_id = {a["id"]: a for a in apis}
    if choice.api_id is not None and choice.api_id not in by_id:
        return DiscoveryChoice(api_id=None, confidence=0, reasoning=f"Model proposed unknown API; discarded. {choice.reasoning}")
    if choice.api_id is not None:
        allowed = {p["name"] for p in by_id[choice.api_id]["parameters"]}
        choice.params = [p for p in choice.params if p.name in allowed]
    return choice
