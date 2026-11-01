"""Shared fixtures: run the real pipeline once per test session."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from generate import generate_all  # noqa: E402
from medallion import run_domain  # noqa: E402

DOMAINS = ("oil_gas", "mining")


@pytest.fixture(scope="session")
def bronze():
    return generate_all()


@pytest.fixture(scope="session")
def runs(bronze, tmp_path_factory):
    """Run every domain into its own SQLite file so tests can query each layer."""
    out = {}
    db_dir = tmp_path_factory.mktemp("db")
    for d in DOMAINS:
        db = db_dir / f"{d}.db"
        out[d] = {"report": run_domain(d, bronze[d], db), "db": db}
    return out
