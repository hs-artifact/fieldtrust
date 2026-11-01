"""Data trust score = 0.7 x rule pass rate + 0.3 x reconciliation score."""
import pandas as pd
import pytest

from run import score_trust


def fake_report(clean, total, recon_err, tol=2.0):
    days = list(range(len(recon_err)))
    return {
        "contract": {"reconciliation": {"tolerance_pct": tol}},
        "datasets": {"a": {"daily": [{"day": d, "clean": clean, "total": total} for d in days]}},
        "gold": pd.DataFrame({"day": days, "recon_error_pct": recon_err}),
        "rules": [{"id": "R1", "dimension": "validity"}],
        "rule_daily": [{"rule_id": "R1", "day": d, "failed": total - clean, "total": total} for d in days],
    }


def test_perfect_data_scores_100():
    trust, _ = score_trust(fake_report(100, 100, [0.5, 1.0, 2.0]))
    assert trust["trust"].tolist() == pytest.approx([100, 100, 100])


def test_reconciliation_far_outside_tolerance_caps_trust_at_70():
    # error = tolerance + 1.5 x tolerance gives a reconciliation score of 0
    trust, _ = score_trust(fake_report(100, 100, [5.0]))
    assert trust["recon_score"].iloc[0] == pytest.approx(0)
    assert trust["trust"].iloc[0] == pytest.approx(70)


def test_failed_rules_lower_the_pass_rate_part():
    trust, _ = score_trust(fake_report(90, 100, [1.0]))
    assert trust["pass_rate"].iloc[0] == pytest.approx(90)
    assert trust["trust"].iloc[0] == pytest.approx(0.7 * 90 + 30)


def test_missing_reconciliation_counts_as_untrusted():
    trust, _ = score_trust(fake_report(100, 100, [None]))
    assert trust["recon_score"].iloc[0] == pytest.approx(0)
