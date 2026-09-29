"""Lifecycle Agent (doc §98, Agent 6): turns deterministic lifecycle evidence into a readable review.

The findings themselves are computed by rules in the Node backend. The model only writes the
explanations, suggested actions and picks the priority; the backend merges its wording onto the
rule-based findings, so the model cannot add, drop or re-classify a finding."""

from __future__ import annotations

import json

from pydantic import BaseModel

from app.providers.llm import LLMProvider

SYSTEM_PROMPT = """You are the API Lifecycle Agent for a data platform. You are given findings about
registered APIs (unused, broken, dangling, deprecated) with the evidence for each. For every finding,
write a one-sentence business-readable explanation and one concrete suggested action. Then write a
short summary of the whole review, and pick the single API that most needs attention (priority_api_name)
with a one-sentence reason. Only refer to APIs and facts present in the findings. Do not invent evidence."""


class FindingIn(BaseModel):
    api_name: str
    issue_type: str
    severity: str
    evidence: str
    usage_count: int


class FindingText(BaseModel):
    api_name: str
    issue_type: str
    explanation: str
    suggested_action: str


class LifecycleReportText(BaseModel):
    summary: str
    priority_api_name: str
    priority_reason: str
    findings: list[FindingText]


async def run_lifecycle(llm: LLMProvider, period_days: int, findings: list[FindingIn]) -> LifecycleReportText:
    payload = json.dumps(
        {"analysis_period_days": period_days, "findings": [f.model_dump() for f in findings]},
        separators=(",", ":"),
    )
    return await llm.generate_structured(
        system_prompt=SYSTEM_PROMPT, user_prompt=payload, response_model=LifecycleReportText
    )
