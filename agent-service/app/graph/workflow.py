"""POC LangGraph workflow (doc §99), analysis half: Intent -> API Discovery.

Governance, HITL and API invocation are deterministic and live in the Node backend, which
calls this graph. API Registry is always checked before any data discovery (doc §99)."""

from __future__ import annotations

from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents.api_discovery import DiscoveryChoice, run_api_discovery_with_recheck
from app.agents.intent import Intent, run_intent
from app.providers.llm import LLMProvider
from app.registry import list_active_apis


class AskState(TypedDict, total=False):
    request_text: str
    intent: Intent
    apis: list[dict]
    discovery: DiscoveryChoice


def build_graph(llm: LLMProvider):
    async def intent_node(state: AskState) -> AskState:
        return {"intent": await run_intent(llm, state["request_text"])}

    async def discovery_node(state: AskState) -> AskState:
        apis = list_active_apis()
        return {"apis": apis, "discovery": await run_api_discovery_with_recheck(llm, state["intent"], apis)}

    g = StateGraph(AskState)
    g.add_node("intent", intent_node)
    g.add_node("api_discovery", discovery_node)
    g.add_edge(START, "intent")
    g.add_edge("intent", "api_discovery")
    g.add_edge("api_discovery", END)
    return g.compile()
