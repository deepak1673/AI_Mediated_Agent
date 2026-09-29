"""LLMProvider interface + Gemini adapter (doc §37 — modular infrastructure).

Agents depend on this interface, never on the Gemini SDK directly, so the model/
provider can be swapped later without touching agent logic (doc §2.4).
"""

from __future__ import annotations

import asyncio
import re
from abc import ABC, abstractmethod
from typing import TypeVar

from pydantic import BaseModel

from app.config import settings

T = TypeVar("T", bound=BaseModel)


def _retry_delay_seconds(err: Exception) -> float:
    m = re.search(r"retry in ([\d.]+)s", str(err))
    return min(float(m.group(1)) + 1 if m else 20.0, 65.0)


class LLMProvider(ABC):
    @abstractmethod
    async def generate_structured(self, *, system_prompt: str, user_prompt: str, response_model: type[T]) -> T:
        """Return a validated instance of response_model. Never wraps free-form text
        directly into an execution path — callers must Pydantic-validate the result."""
        raise NotImplementedError


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash") -> None:
        from google import genai

        self._client = genai.Client(api_key=api_key)
        self._model = model

    async def generate_structured(self, *, system_prompt: str, user_prompt: str, response_model: type[T]) -> T:
        from google.genai import errors

        for attempt in range(3):
            try:
                response = await self._client.aio.models.generate_content(
                    model=self._model,
                    contents=user_prompt,
                    config={
                        "system_instruction": system_prompt,
                        "response_mime_type": "application/json",
                        "response_schema": response_model,
                        "temperature": 0,
                    },
                )
                return response_model.model_validate_json(response.text)
            except errors.ServerError:
                # Transient Gemini overload (503 etc.): brief backoff, then give up.
                if attempt == 2:
                    raise
                await asyncio.sleep(2 * (attempt + 1))
            except errors.ClientError as e:
                # Free-tier quota (429): wait out the suggested delay instead of failing the request.
                # Only wait out short per-minute limits; a long delay means daily quota - fail fast.
                if e.code != 429 or attempt == 2 or _retry_delay_seconds(e) > 20:
                    raise
                await asyncio.sleep(_retry_delay_seconds(e))
        raise RuntimeError("unreachable")


NL = chr(10)


class GroqProvider(LLMProvider):
    """Groq (OpenAI-compatible chat completions) with JSON mode. The Pydantic schema is given in the
    prompt and the reply is validated with Pydantic, so nothing unvalidated reaches an execution path."""

    _URL = "https://api.groq.com/openai/v1/chat/completions"

    def __init__(self, api_key: str, model: str, fallback_model: str | None = None) -> None:
        self._key = api_key
        self._models = [model] + ([fallback_model] if fallback_model and fallback_model != model else [])

    async def generate_structured(self, *, system_prompt: str, user_prompt: str, response_model: type[T]) -> T:
        # Groq limits tokens per day per model; when the primary model's daily cap is hit, use the fallback.
        for i, model in enumerate(self._models):
            try:
                return await self._generate(model, system_prompt, user_prompt, response_model)
            except LLMHttpError as e:
                if e.code == 429 and i < len(self._models) - 1 and "per day" in e.detail.lower():
                    continue
                raise
        raise RuntimeError("unreachable")

    async def _generate(self, model: str, system_prompt: str, user_prompt: str, response_model: type[T]) -> T:
        import json

        import httpx

        schema = json.dumps(response_model.model_json_schema(), separators=(",", ":"))
        messages = [
            {
                "role": "system",
                "content": (
                    f"{system_prompt}" + NL + NL
                    + "Respond with a single JSON object that conforms to this JSON Schema. "
                    + "Include every required field. No prose outside the JSON." + NL
                    + f"Schema: {schema}"
                ),
            },
            {"role": "user", "content": user_prompt},
        ]
        last_error = ""
        async with httpx.AsyncClient(timeout=60) as client:
            for attempt in range(3):
                resp = await client.post(
                    self._URL,
                    headers={"Authorization": f"Bearer {self._key}"},
                    json={
                        "model": model,
                        "messages": messages,
                        "temperature": 0,
                        "response_format": {"type": "json_object"},
                        "reasoning_effort": "low",
                    },
                )
                if resp.status_code == 429 or resp.status_code >= 500:
                    delay = float(resp.headers.get("retry-after", 2 * (attempt + 1))) + 1
                    if attempt == 2 or delay > 45:
                        raise LLMHttpError(resp.status_code, resp.text[:300])
                    await asyncio.sleep(delay)
                    continue
                if resp.status_code >= 400:
                    raise LLMHttpError(resp.status_code, resp.text[:300])
                content = resp.json()["choices"][0]["message"]["content"]
                try:
                    return response_model.model_validate_json(content)
                except Exception as e:  # invalid/mismatched JSON: tell the model once what was wrong
                    last_error = str(e)[:400]
                    messages += [
                        {"role": "assistant", "content": content},
                        {"role": "user", "content": f"That JSON failed validation: {last_error}. Return corrected JSON only."},
                    ]
        raise RuntimeError(f"Groq returned invalid JSON after retries: {last_error}")


class LLMHttpError(Exception):
    """Provider HTTP failure; `code` mirrors the Gemini SDK error so callers can map 429 uniformly."""

    def __init__(self, code: int, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail


def get_llm_provider() -> LLMProvider:
    choice = settings.llm_provider
    if choice == "auto":
        choice = "groq" if settings.grok_api_key else "gemini"
    if choice == "groq":
        if not settings.grok_api_key:
            raise RuntimeError("GROK_API_KEY (a Groq key) is not set in agent-service/.env")
        return GroqProvider(api_key=settings.grok_api_key, model=settings.groq_model, fallback_model=settings.groq_fallback_model)
    if not settings.gemini_api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to agent-service/.env before running any "
            "LLM-backed agent (Intent, API/Data Discovery, API Planning, Validation)."
        )
    return GeminiProvider(api_key=settings.gemini_api_key, model=settings.gemini_model)
