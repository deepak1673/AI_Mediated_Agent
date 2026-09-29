"""API Planning Agent (doc §98, Agent 4): structured API + query plan for a new API.

The output is a structured plan, never raw SQL. The Node backend validates it against the
catalog and compiles it deterministically."""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, Field

from app.agents.data_discovery import DataDiscovery
from app.agents.intent import Intent
from app.providers.llm import LLMProvider

SYSTEM_PROMPT = """You design a reusable read-only REST API (a structured query plan) for a data request.
Rules:
- Use ONLY the tables/columns provided, spelled exactly. Never invent columns (for example surrogate keys such as *_key) that are not listed. All tables are in the warehouse schema, written "warehouse.table".
- Give every table a short lowercase alias. Columns are written "alias.column".
- Fact tables join to dimensions via the *_key columns (e.g. fact_orders.customer_key = dim_customer.customer_key).
- For aggregates (sum/count/avg/min/max) every non-aggregated select column must also be in group_by.
- select `alias` is the camelCase JSON field name of the output column.
- Make the API reusable: expose optional filters as parameters (name in camelCase) instead of hard-coding values.
  Each filter must reference a parameter that is also listed in `parameters`.
- Never select PII columns (email, phone) unless the request explicitly needs them.
- slug: lowercase words separated by hyphens, describing the capability (e.g. "customer-revenue-by-country")."""


class SelectField(BaseModel):
    column: str
    alias: str
    agg: Literal["none", "sum", "count", "avg", "min", "max"]


class JoinSpec(BaseModel):
    table: str
    alias: str
    left: str
    right: str


class FilterSpec(BaseModel):
    column: str
    op: Literal["eq", "gte", "lte", "in"]
    param: str
    required: bool


class OrderSpec(BaseModel):
    column: str
    direction: Literal["asc", "desc"]


class ParameterSpec(BaseModel):
    name: str
    type: str
    required: bool
    description: str


class ApiPlan(BaseModel):
    name: str = Field(description="Short human title, e.g. Customer Revenue by Country")
    description: str
    slug: str
    metric: str
    dimensions: list[str] = Field(default_factory=list)
    table: str = Field(description="Primary table as warehouse.table")
    table_alias: str
    joins: list[JoinSpec] = Field(default_factory=list)
    select: list[SelectField]
    filters: list[FilterSpec] = Field(default_factory=list)
    group_by: list[str] = Field(default_factory=list)
    order_by: list[OrderSpec] = Field(default_factory=list)
    limit: int
    parameters: list[ParameterSpec] = Field(default_factory=list)


async def run_api_planning(
    llm: LLMProvider,
    intent: Intent,
    discovery: DataDiscovery,
    catalog: list[dict],
    problems: list[str] | None = None,
) -> ApiPlan:
    picked = {(p.schema_name, p.table_name): set(p.columns) for p in discovery.assets}
    slim = [
        {
            "table": f'{a["schema_name"]}.{a["table_name"]}',
            "columns": [
                {"name": c["column_name"], "type": c["data_type"]}
                for c in a["columns"]
                if c["column_name"] in picked[(a["schema_name"], a["table_name"])]
            ],
        }
        for a in catalog
        if (a["schema_name"], a["table_name"]) in picked
    ]
    data_json = json.dumps(slim, separators=(",", ":"))
    prompt = f"Request intent:\n{intent.model_dump_json()}\n\nAvailable data:\n{data_json}"
    if problems:
        prompt += (
            "\n\nYour previous plan was rejected by validation. Fix these problems and use only the "
            "columns listed above:\n- " + "\n- ".join(problems)
        )
    return await llm.generate_structured(system_prompt=SYSTEM_PROMPT, user_prompt=prompt, response_model=ApiPlan)
