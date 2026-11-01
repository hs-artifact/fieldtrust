"""The medallion pipeline: nothing is lost, nothing bad reaches silver or gold."""
import sqlite3

import pytest

from conftest import DOMAINS, generate_all


def _rules(report, dataset, severity=None):
    return [r for r in report["rules"] if r["dataset"] == dataset and (severity is None or r["severity"] == severity)]


@pytest.mark.parametrize("domain", DOMAINS)
def test_every_bronze_row_lands_in_silver_or_quarantine(runs, domain):
    for name, ds in runs[domain]["report"]["datasets"].items():
        assert ds["bronze"] > 0, name
        # staging flags duplicates rather than dropping them, so the counts must add up exactly
        assert ds["silver"] + ds["quarantined"] == ds["bronze"], f"{name}: rows went missing"
        assert ds["quarantined"] < 0.25 * ds["bronze"], f"{name}: more than a quarter quarantined"


@pytest.mark.parametrize("domain", DOMAINS)
def test_every_row_that_breaks_a_blocking_rule_is_quarantined(runs, domain):
    """Re-check against the staged rows: each failure of a block rule must sit in quarantine, not silver."""
    rep, con = runs[domain]["report"], sqlite3.connect(runs[domain]["db"])
    for name in rep["datasets"]:
        for r in _rules(rep, name, "block"):
            failing = con.execute(
                f"SELECT COUNT(*) FROM staged_{name} WHERE NOT COALESCE(({r['valid_when']}), 0)").fetchone()[0]
            held = con.execute(
                f"SELECT COUNT(*) FROM quarantine_{name} WHERE ' ' || failed_rules || ' ' LIKE '% {r['id']} %'").fetchone()[0]
            assert failing == held, f"{r['id']}: {failing} rows fail it, {held} are quarantined for it"
            assert failing == r["failed"], f"{r['id']}: report count differs from a fresh check"


@pytest.mark.parametrize("domain", DOMAINS)
def test_quarantined_rows_name_the_blocking_rules_they_broke(runs, domain):
    rep, con = runs[domain]["report"], sqlite3.connect(runs[domain]["db"])
    for name in rep["datasets"]:
        block = {r["id"] for r in _rules(rep, name, "block")}
        for (failed,) in con.execute(f"SELECT failed_rules FROM quarantine_{name}"):
            ids = set(failed.split())
            assert ids, f"quarantine_{name} row has no rule ID"
            assert ids <= block, f"unexpected rule IDs {ids - block} in quarantine_{name}"


@pytest.mark.parametrize("domain", DOMAINS)
def test_warn_failures_are_promoted_with_a_flag(runs, domain):
    rep, con = runs[domain]["report"], sqlite3.connect(runs[domain]["db"])
    for name in rep["datasets"]:
        for r in _rules(rep, name, "warn"):
            # a warn failure that is not also blocked must reach silver with dq_flag = 1
            block_ok = " AND ".join(f'"f_{b["id"]}" = 0' for b in _rules(rep, name, "block")) or "1"
            promoted = con.execute(
                f"SELECT COUNT(*) FROM checked_{name} WHERE \"f_{r['id']}\" = 1 AND {block_ok}").fetchone()[0]
            flagged_total = con.execute(f"SELECT COUNT(*) FROM silver_{name} WHERE dq_flag = 1").fetchone()[0]
            unflagged = max(0, promoted - flagged_total)
            assert unflagged == 0, f"{r['id']}: warn failures promoted without dq_flag"


@pytest.mark.parametrize("domain", DOMAINS)
def test_gold_has_one_row_per_day_and_a_reconciliation_kpi(runs, domain):
    gold = runs[domain]["report"]["gold"]
    assert len(gold) == 90
    assert gold["day"].is_unique
    assert "recon_error_pct" in gold.columns
    assert (gold["recon_error_pct"].dropna() >= 0).all()


def test_synthetic_data_is_reproducible(bronze):
    again = generate_all()
    for domain, tables in bronze.items():
        for name, df in tables.items():
            assert df.equals(again[domain][name]), f"{domain}.{name} changed between runs"
