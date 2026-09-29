"""Data Discovery Agent (doc §98, Agent 3): which catalog assets/columns can answer the intent?

Runs only when no existing API fits. The LLM chooses; results are validated against the catalog."""

from __future__ import annotations

import json

from pydantic import BaseModel, Field

from app.agents.intent import Intent
from app.providers.llm import LLMProvider

SYSTEM_PROMPT = """You are a data discovery agent. Given a business request and a data catalog,
choose the minimum set of tables and columns needed to answer it. Use column names and
synonyms to interpret business terms (e.g. "region" -> country, "revenue" -> amount).
Only pick tables and columns that appear in the catalog. Prefer tables with in_warehouse=true.
If the needed data exists only in a table with in_warehouse=false, you MUST still list that table
and its needed columns in `assets` (so it can be loaded by ETL) and set data_available=false. Only when the
data exists nowhere in the catalog, return empty `assets`, data_available=false and explain in `missing`.
Include join key columns for any table you join."""


class AssetPick(BaseModel):
    schema_name: str
    table_name: str
    columns: list[str]


class DataDiscovery(BaseModel):
    data_available: bool
    assets: list[AssetPick] = Field(default_factory=list)
    missing: str = Field(description="What data is unavailable, or empty string if none")
    reasoning: str


def _catalog_for_prompt(catalog: list[dict]) -> str:
    return json.dumps(
        [
            {
                "schema": a["schema_name"],
                "table": a["table_name"],
                "description": a["description"],
                "in_warehouse": a["in_warehouse"],
                "columns": [
                    {"name": c["column_name"], "type": c["data_type"], "synonyms": c["synonyms"]}
                    for c in a["columns"]
                ],
            }
            for a in catalog
        ],
        separators=(",", ":"),
    )


async def run_data_discovery(llm: LLMProvider, intent: Intent, catalog: list[dict]) -> DataDiscovery:
    result = await llm.generate_structured(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=f"Request intent:\n{intent.model_dump_json()}\n\nData catalog:\n{_catalog_for_prompt(catalog)}",
        response_model=DataDiscovery,
    )
    known = {(a["schema_name"], a["table_name"]): {c["column_name"] for c in a["columns"]} for a in catalog}
    in_wh = {(a["schema_name"], a["table_name"]): a["in_warehouse"] for a in catalog}
    valid: list[AssetPick] = []
    for pick in result.assets:
        key = (pick.schema_name, pick.table_name)
        if key not in known:
            continue
        valid.append(
            AssetPick(schema_name=key[0], table_name=key[1], columns=[c for c in pick.columns if c in known[key]])
        )
    result.assets = valid
    if not valid or any(not in_wh[(p.schema_name, p.table_name)] for p in valid):
        result.data_available = False
        result.missing = result.missing or "Required data is not available in the warehouse."
    return result
