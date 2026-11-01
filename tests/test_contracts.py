"""Data contracts are the source of truth, so they are checked like code."""
import re

import pytest
import yaml

from conftest import DOMAINS, ROOT

DIMENSIONS = {"completeness", "validity", "uniqueness", "timeliness", "consistency"}
OWNER_FIELDS = ("business_owner", "data_steward", "technical_owner")


def contract(domain):
    return yaml.safe_load((ROOT / "governance" / "contracts" / f"{domain}.yml").read_text())


@pytest.mark.parametrize("domain", DOMAINS)
def test_every_dataset_has_owners_and_a_staging_query(domain):
    for ds in contract(domain)["datasets"]:
        for f in OWNER_FIELDS:
            assert ds.get(f), f"{ds['name']} has no {f}"
        assert ds.get("freshness_sla_minutes", 0) > 0, f"{ds['name']} has no freshness SLA"
        assert (ROOT / "pipeline" / "sql" / "stage" / f"{ds['name']}.sql").exists()


@pytest.mark.parametrize("domain", DOMAINS)
def test_rules_are_well_formed(domain):
    ids = []
    for ds in contract(domain)["datasets"]:
        for r in ds["rules"]:
            ids.append(r["id"])
            assert r["dimension"] in DIMENSIONS, r["id"]
            assert r["severity"] in {"block", "warn"}, r["id"]
            assert r["valid_when"].strip(), r["id"]
            assert r["description"].strip(), r["id"]
            assert re.fullmatch(r"(OG|MN)-[A-Z]-\d{2}", r["id"]), r["id"]
    assert len(ids) == len(set(ids)), "rule IDs must be unique"


@pytest.mark.parametrize("domain", DOMAINS)
def test_reconciliation_rule_has_a_tolerance(domain):
    rec = contract(domain)["reconciliation"]
    assert 0 < rec["tolerance_pct"] <= 5
