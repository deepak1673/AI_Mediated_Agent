"""Unit tests for the agent logic using a fake LLMProvider (no network, no quota).

Run from agent-service/:  .venv/Scripts/python -m unittest discover -s tests -v
"""

import asyncio
import unittest

from app.agents.api_discovery import DiscoveryChoice, run_api_discovery, run_api_discovery_with_recheck, shortlist
from app.agents.data_discovery import DataDiscovery, run_data_discovery
from app.agents.intent import Filter, Intent
from app.providers.llm import LLMProvider


class FakeLLM(LLMProvider):
    """Returns queued responses in order and records the prompts it was given."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.prompts: list[str] = []

    async def generate_structured(self, *, system_prompt, user_prompt, response_model):
        self.prompts.append(user_prompt)
        return self.responses.pop(0)


def api(id_, name, params=()):
    return {
        "id": id_, "name": name, "description": name, "metric": "m", "dimensions": [],
        "parameters": [{"name": p} for p in params],
    }


APIS = [
    api("a1", "Customers", ["country"]),
    api("a2", "Supplier List"),
    api("a3", "Supplier Count by Country"),
    api("a4", "Orders", ["country"]),
]


def intent(summary, metric="m", dims=()):
    return Intent(summary=summary, metric=metric, dimensions=list(dims), filters=[])


def run(coro):
    return asyncio.run(coro)


class ShortlistTests(unittest.TestCase):
    def test_matches_on_name_terms(self):
        names = [a["name"] for a in shortlist(intent("List all suppliers with their country", "supplier_list", ["country"]), APIS)]
        self.assertEqual(names[0:2], ["Supplier List", "Supplier Count by Country"][0:2])

    def test_no_overlap_gives_empty_shortlist(self):
        self.assertEqual(shortlist(intent("Show technician work logs and hours", "technician_hours"), APIS), [])

    def test_shared_entity_word_alone_can_shortlist(self):
        # The shortlist is only a candidate filter; the model's second check must reject weak matches.
        names = [a["name"] for a in shortlist(intent("Which customers opted in to marketing emails", "customer_count"), APIS)]
        self.assertEqual(names, ["Customers"])


class DiscoveryTests(unittest.TestCase):
    def test_hallucinated_api_id_is_discarded(self):
        llm = FakeLLM(DiscoveryChoice(api_id="nope", params=[], confidence=0.9, reasoning="x"))
        out = run(run_api_discovery(llm, intent("x"), APIS))
        self.assertIsNone(out.api_id)

    def test_undeclared_parameters_are_dropped(self):
        llm = FakeLLM(DiscoveryChoice(api_id="a1", params=[Filter(name="country", value="India"), Filter(name="ssn", value="1")], confidence=0.9, reasoning="x"))
        out = run(run_api_discovery(llm, intent("customers"), APIS))
        self.assertEqual([p.name for p in out.params], ["country"])

    def test_second_check_recovers_a_missed_api(self):
        miss = DiscoveryChoice(api_id=None, params=[], confidence=0, reasoning="none")
        hit = DiscoveryChoice(api_id="a2", params=[], confidence=0.8, reasoning="lists suppliers")
        llm = FakeLLM(miss, hit)
        out = run(run_api_discovery_with_recheck(llm, intent("List all suppliers", "supplier_list"), APIS))
        self.assertEqual(out.api_id, "a2")
        self.assertEqual(len(llm.prompts), 2)
        self.assertNotIn('"Orders"', llm.prompts[1])  # second call sees only the shortlist

    def test_no_second_call_when_nothing_is_close(self):
        llm = FakeLLM(DiscoveryChoice(api_id=None, params=[], confidence=0, reasoning="none"))
        out = run(run_api_discovery_with_recheck(llm, intent("Show technician work logs", "technician_hours"), APIS))
        self.assertIsNone(out.api_id)
        self.assertEqual(len(llm.prompts), 1)

    def test_no_second_call_when_first_pass_hits(self):
        llm = FakeLLM(DiscoveryChoice(api_id="a1", params=[], confidence=0.9, reasoning="ok"))
        out = run(run_api_discovery_with_recheck(llm, intent("customers"), APIS))
        self.assertEqual(out.api_id, "a1")
        self.assertEqual(len(llm.prompts), 1)

    def test_model_that_rejects_all_candidates_stays_a_miss(self):
        miss = DiscoveryChoice(api_id=None, params=[], confidence=0, reasoning="none")
        llm = FakeLLM(miss, miss)
        out = run(run_api_discovery_with_recheck(llm, intent("Which customers opted in", "customer_count"), APIS))
        self.assertIsNone(out.api_id)


CATALOG = [
    {"schema_name": "warehouse", "table_name": "dim_customer", "description": "d", "in_warehouse": True,
     "columns": [{"column_name": "country", "data_type": "text", "synonyms": []}]},
    {"schema_name": "erp", "table_name": "suppliers", "description": "d", "in_warehouse": False,
     "columns": [{"column_name": "name", "data_type": "text", "synonyms": []}]},
]


class DataDiscoveryTests(unittest.TestCase):
    def _pick(self, *picks, available=True):
        from app.agents.data_discovery import AssetPick

        return DataDiscovery(
            data_available=available, missing="", reasoning="r",
            assets=[AssetPick(schema_name=s, table_name=t, columns=c) for s, t, c in picks],
        )

    def test_invented_tables_and_columns_are_removed(self):
        llm = FakeLLM(self._pick(("warehouse", "dim_customer", ["country", "ssn"]), ("warehouse", "ghost", ["x"])))
        out = run(run_data_discovery(llm, intent("x"), CATALOG))
        self.assertEqual([(a.table_name, a.columns) for a in out.assets], [("dim_customer", ["country"])])
        self.assertTrue(out.data_available)

    def test_source_only_table_marks_data_unavailable(self):
        llm = FakeLLM(self._pick(("erp", "suppliers", ["name"])))
        out = run(run_data_discovery(llm, intent("suppliers"), CATALOG))
        self.assertFalse(out.data_available)
        self.assertEqual(out.assets[0].table_name, "suppliers")  # kept, so the backend can offer an ETL

    def test_nothing_valid_means_unavailable(self):
        llm = FakeLLM(self._pick(("warehouse", "ghost", ["x"])))
        out = run(run_data_discovery(llm, intent("x"), CATALOG))
        self.assertFalse(out.data_available)
        self.assertEqual(out.assets, [])


if __name__ == "__main__":
    unittest.main()
