"""
Bronze -> silver -> gold, driven by data contracts.

The rule engine is deliberately small: every rule in a contract is a SQL
predicate. A row that fails a `block` rule is quarantined with the list of
rules it broke; a row that fails only `warn` rules is promoted but counted
against the data trust score. Gold tables are built from silver only.
"""
from __future__ import annotations

import datetime as dt
import sqlite3
import time
from pathlib import Path

import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / "pipeline" / "sql"
CONTRACTS = ROOT / "governance" / "contracts"


def load_contract(domain: str) -> dict:
    return yaml.safe_load((CONTRACTS / f"{domain}.yml").read_text())


def _to_sql_frame(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for c in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[c]):
            out[c] = out[c].dt.strftime("%Y-%m-%d %H:%M:%S")
        elif out[c].dtype == object:
            out[c] = out[c].map(lambda v: str(v) if isinstance(v, (dt.date, dt.datetime)) else v)
    return out


def run_domain(domain: str, bronze: dict[str, pd.DataFrame], db_path: Path | None = None) -> dict:
    contract = load_contract(domain)
    con = sqlite3.connect(db_path or ":memory:")
    report = {"domain": domain, "datasets": {}, "rules": [], "rule_daily": [], "quarantine_samples": {}}

    for ds in contract["datasets"]:
        name = ds["name"]
        t0 = time.perf_counter()
        _to_sql_frame(bronze[name]).to_sql(f"bronze_{name}", con, index=False, if_exists="replace")

        stage_sql = (SQL / "stage" / f"{name}.sql").read_text()
        con.execute(f"DROP TABLE IF EXISTS staged_{name}")
        con.execute(f"CREATE TABLE staged_{name} AS {stage_sql}")

        rules = ds["rules"]
        fail_cols = ",\n".join(
            f"CASE WHEN COALESCE(({r['valid_when']}), 0) THEN 0 ELSE 1 END AS \"f_{r['id']}\"" for r in rules)
        con.execute(f"DROP TABLE IF EXISTS checked_{name}")
        con.execute(f"CREATE TABLE checked_{name} AS SELECT s.*, {fail_cols} FROM staged_{name} s")

        block = [r["id"] for r in rules if r["severity"] == "block"]
        allr = [r["id"] for r in rules]
        block_any = " OR ".join(f'"f_{i}" = 1' for i in block) or "0"
        any_fail = " OR ".join(f'"f_{i}" = 1' for i in allr) or "0"
        src_cols = [c for c in pd.read_sql(f"SELECT * FROM staged_{name} LIMIT 0", con).columns
                    if c not in ("dup_rank",)]
        cols = ", ".join(f'"{c}"' for c in src_cols)

        con.execute(f"DROP TABLE IF EXISTS silver_{name}")
        con.execute(f"CREATE TABLE silver_{name} AS SELECT {cols}, ({any_fail}) AS dq_flag "
                    f"FROM checked_{name} WHERE NOT ({block_any})")
        failed_list = " || ".join(
            f"CASE WHEN \"f_{i}\" = 1 THEN '{i} ' ELSE '' END" for i in block) or "''"
        con.execute(f"DROP TABLE IF EXISTS quarantine_{name}")
        con.execute(f"CREATE TABLE quarantine_{name} AS SELECT {cols}, TRIM({failed_list}) AS failed_rules "
                    f"FROM checked_{name} WHERE {block_any}")

        # per-rule, per-day results
        sums = ", ".join(f'SUM("f_{r["id"]}") AS "{r["id"]}"' for r in rules)
        daily = pd.read_sql(
            f"SELECT day, COUNT(*) AS total, SUM(CASE WHEN {any_fail} THEN 0 ELSE 1 END) AS clean, "
            f"SUM(CASE WHEN {block_any} THEN 1 ELSE 0 END) AS quarantined, {sums} "
            f"FROM checked_{name} GROUP BY day ORDER BY day", con)
        for _, row in daily.iterrows():
            for r in rules:
                report["rule_daily"].append(dict(dataset=name, rule_id=r["id"], day=row["day"],
                                                 total=int(row["total"]), failed=int(row[r["id"]] or 0)))
        for r in rules:
            report["rules"].append(dict(dataset=name, **{k: r[k] for k in ("id", "dimension", "severity", "description", "valid_when")},
                                        failed=int(daily[r["id"]].sum()), total=int(daily["total"].sum())))

        n_bronze = con.execute(f"SELECT COUNT(*) FROM bronze_{name}").fetchone()[0]
        n_silver = con.execute(f"SELECT COUNT(*) FROM silver_{name}").fetchone()[0]
        n_quar = con.execute(f"SELECT COUNT(*) FROM quarantine_{name}").fetchone()[0]
        n_flag = con.execute(f"SELECT COUNT(*) FROM silver_{name} WHERE dq_flag = 1").fetchone()[0]
        samples = pd.read_sql(f"SELECT * FROM quarantine_{name} ORDER BY RANDOM() LIMIT 6", con)
        report["quarantine_samples"][name] = samples.where(samples.notna(), None).to_dict("records")
        report["datasets"][name] = dict(
            meta={k: ds[k] for k in ds if k not in ("rules",)},
            bronze=n_bronze, silver=n_silver, quarantined=n_quar, flagged=n_flag,
            seconds=round(time.perf_counter() - t0, 3),
            daily=daily[["day", "total", "clean", "quarantined"]].to_dict("records"),
        )

    gold_sql = (SQL / "gold" / f"{domain}_daily.sql").read_text()
    gold = pd.read_sql(gold_sql, con)
    con.execute("DROP TABLE IF EXISTS gold_daily")
    gold.to_sql("gold_daily", con, index=False)
    report["gold"] = gold
    report["contract"] = contract
    con.close()
    return report
