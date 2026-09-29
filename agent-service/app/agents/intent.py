"""Intent Agent (doc §98, Agent 1): natural language -> structured business intent."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.providers.llm import LLMProvider

SYSTEM_PROMPT = """You extract structured business intent from a data question asked at NovaMart,
a retail company with customers, products, orders and equipment maintenance data.
Do not answer the question. Only describe what data is being asked for.
Use snake_case for metric and dimension names. Put concrete filter values in `filters`
(e.g. name "country" value "India"; name "startDate" value "2025-01-01")."""


class Filter(BaseModel):
    name: str
    value: str


class Intent(BaseModel):
    summary: str = Field(description="One-sentence restatement of the request")
    metric: str = Field(description="What is measured or listed, e.g. order_count, customer_count, revenue")
    dimensions: list[str] = Field(default_factory=list, description="Group-by / breakdown fields")
    filters: list[Filter] = Field(default_factory=list, description="Concrete filter values")


async def run_intent(llm: LLMProvider, request_text: str) -> Intent:
    return await llm.generate_structured(
        system_prompt=SYSTEM_PROMPT, user_prompt=request_text, response_model=Intent
    )
