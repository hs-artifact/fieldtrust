"""The value-chain map is content, but the app depends on its shape."""
import pytest
import yaml

from conftest import DOMAINS, ROOT

TYPES = {"time-series", "event", "document", "geospatial"}
VC = yaml.safe_load((ROOT / "governance" / "valuechain.yml").read_text())


@pytest.mark.parametrize("domain", DOMAINS)
def test_every_stage_is_complete(domain):
    stages = VC[domain]["stages"]
    assert len({s["id"] for s in stages}) == len(stages)
    for s in stages:
        for key in ("name", "what", "assets", "function", "consumers", "kpis", "risks", "sample", "handoff"):
            assert s.get(key), f"{s['id']} has no {key}"
        for item in s["data"]:
            assert item["type"] in TYPES, f"{s['id']}: {item['name']}"
            assert item["period_s"] > 0, f"{s['id']}: {item['name']}"
            for key in ("source", "format", "frequency", "volume"):
                assert item.get(key), f"{s['id']}: {item['name']} has no {key}"


@pytest.mark.parametrize("domain", DOMAINS)
def test_live_handoffs_point_at_real_gold_columns(runs, domain):
    gold = runs[domain]["report"]["gold"]
    live = [s for s in VC[domain]["stages"] if s["handoff"].get("live")]
    assert live, "each domain should have at least one live hand-off"
    for s in live:
        assert s["handoff"]["live"] in gold.columns
        value = s["handoff"].get("value")
        if value:
            assert value["volume_key"] in gold.columns
            assert value["unit_price"] > 0


@pytest.mark.parametrize("domain", DOMAINS)
def test_modelled_datasets_exist_in_the_contracts(runs, domain):
    known = set(runs[domain]["report"]["datasets"])
    for s in VC[domain]["stages"]:
        for ds in s.get("fieldtrust", []):
            assert ds in known, f"{s['id']} links to unknown dataset {ds}"
