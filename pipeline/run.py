"""
FieldTrust pipeline entry point.

    python pipeline/run.py

1. Generates synthetic bronze data for both domain packs
2. Runs the contract-driven medallion pipeline (bronze -> silver -> gold)
3. Scores data trust, operations and adoption
4. Publishes one JSON bundle the web app reads: app/data/fieldtrust.json
"""
from __future__ import annotations

import datetime as dt
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from generate import generate_all, START, DAYS
from medallion import run_domain

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "app" / "data" / "fieldtrust.json"
DB_DIR = ROOT / "data"
PROGRAMME = ROOT / "governance" / "programme"

DIMENSIONS = ["completeness", "validity", "uniqueness", "timeliness", "consistency"]

ADOPTION_GROUPS = {
    "oil_gas": {  # group: (baseline %, sensitivity to trust)
        "Production Engineers": (52, 1.55),
        "Control Room Operators": (44, 1.65),
        "Field Supervisors": (30, 1.45),
        "Asset Management": (40, 1.35),
    },
    "mining": {
        "Dispatchers": (55, 1.40),
        "Shift Supervisors": (33, 1.55),
        "Mine Planners": (42, 1.30),
        "Site Leadership": (45, 1.20),
    },
}

INFRA_EVENTS = {
    "oil_gas": [
        ("historian_well_hourly", "Historian interface service stopped after OS patch", "P2"),
        ("historian_well_hourly", "Network switch failure at gathering station", "P1"),
        ("daily_production_report", "Form server certificate expired", "P3"),
        ("fiscal_meter_daily", "Flow computer export file not delivered", "P2"),
        ("historian_well_hourly", "Tag server memory exhaustion", "P3"),
        ("pipeline", "Orchestrator job queue stalled", "P3"),
        ("daily_production_report", "Field tablet sync failure (2 wells)", "P4"),
        ("fiscal_meter_daily", "Meter proving window: manual export used", "P4"),
    ],
    "mining": [
        ("fms_haul_cycles", "Pit radio mesh outage, north wall", "P1"),
        ("fms_haul_cycles", "FMS server failover test overran", "P3"),
        ("wim_tickets", "WIM controller power trip during storm", "P2"),
        ("fatigue_alerts", "Fatigue camera firmware rollback on 6 trucks", "P2"),
        ("pipeline", "Orchestrator job queue stalled", "P3"),
        ("fms_haul_cycles", "OBU GPS drift after antenna damage (HT-117)", "P4"),
        ("wim_tickets", "Weighbridge loop detector fault", "P3"),
        ("fatigue_alerts", "Control-room validation console offline", "P2"),
    ],
}


def _round(v, n=2):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    return round(float(v), n)


def score_trust(rep: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    tol = rep["contract"]["reconciliation"]["tolerance_pct"]
    frames = []
    for name, ds in rep["datasets"].items():
        d = pd.DataFrame(ds["daily"])
        d["pass"] = d["clean"] / d["total"]
        frames.append(d[["day", "pass"]].assign(dataset=name))
    pr = pd.concat(frames).groupby("day")["pass"].mean().rename("pass_rate") * 100
    gold = rep["gold"].set_index("day")
    err = gold["recon_error_pct"].fillna(4 * tol)
    recon = (100 * (1 - (err - tol).clip(lower=0) / (1.5 * tol))).clip(0, 100).rename("recon_score")
    trust = pd.concat([pr, recon], axis=1)
    trust["trust"] = 0.7 * trust["pass_rate"] + 0.3 * trust["recon_score"]

    rd = pd.DataFrame(rep["rule_daily"])
    dims_map = {r["id"]: r["dimension"] for r in rep["rules"]}
    rd["dimension"] = rd["rule_id"].map(dims_map)
    dim = rd.groupby(["day", "dimension"]).agg(failed=("failed", "sum"), total=("total", "sum")).reset_index()
    dim["score"] = 100 * (1 - dim["failed"] / dim["total"])
    dim = dim.pivot(index="day", columns="dimension", values="score")
    dim["consistency"] = trust["recon_score"]
    return trust.reset_index().rename(columns={"index": "day"}), dim.reset_index()


def weekly(series: pd.Series) -> list[float]:
    s = series.reset_index(drop=True)
    return [float(s[i:i + 7].mean()) for i in range(0, len(s) - len(s) % 7 or len(s), 7)]


def build_adoption(domain: str, trust: pd.DataFrame, rng) -> dict:
    tw = weekly(trust["trust"])
    t0 = tw[0]
    weeks = [(START + dt.timedelta(days=7 * i)).strftime("%Y-%m-%d") for i in range(len(tw))]
    groups = {}
    for g, (base, sens) in ADOPTION_GROUPS[domain].items():
        vals, prev = [], base
        for i in range(len(tw)):
            lagged = tw[max(0, i - 2)]
            target = base + sens * 1.15 * (lagged - t0)
            prev = prev + 0.55 * (target - prev) + rng.normal(0, 1.2)
            vals.append(round(float(np.clip(prev, 5, 97)), 1))
        groups[g] = vals
    overall = [round(float(np.mean([groups[g][i] for g in groups])), 1) for i in range(len(tw))]
    return {"weeks": weeks, "trust_weekly": [round(x, 1) for x in tw], "groups": groups, "overall": overall}


def build_ops(domain: str, rep: dict, rng) -> dict:
    days = [d["day"] for d in next(iter(rep["datasets"].values()))["daily"]]
    sources = list(rep["datasets"].keys()) + ["pipeline"]
    first_iv = rep["contract"]["interventions"][0]["day"]
    downtime = {s: np.zeros(len(days)) for s in sources}
    incidents = []
    n = 0

    # 1) data-quality breaches detected by the rule engine
    for name, ds in rep["datasets"].items():
        d = pd.DataFrame(ds["daily"])
        rate = d["quarantined"] / d["total"]
        thr = max(rate.median() * 2.5, 0.02)
        for i in np.where(rate > thr)[0][:4]:
            n += 1
            mttr = rng.uniform(5, 16) if i < first_iv else rng.uniform(1, 4)
            incidents.append(dict(id=f"INC-{n:03d}", day=days[i], source=name, severity="P3",
                                  kind="Data quality breach",
                                  title=f"Quarantine rate {rate[i]*100:.1f}% on {name.replace('_', ' ')}",
                                  detected_by="Rule engine", mttr_h=round(mttr, 1)))
    # 2) infrastructure / integration events
    for src, title, sev in INFRA_EVENTS[domain]:
        i = int(rng.integers(3, len(days) - 3))
        base = {"P1": 5.5, "P2": 3.5, "P3": 2.0, "P4": 1.0}[sev]
        mttr = base * (rng.uniform(1.3, 2.2) if i < first_iv else rng.uniform(0.5, 1.0))
        n += 1
        incidents.append(dict(id=f"INC-{n:03d}", day=days[i], source=src, severity=sev,
                              kind="Availability", title=title,
                              detected_by=rng.choice(["Synthetic heartbeat", "Freshness monitor", "Shift report"]),
                              mttr_h=round(mttr, 1)))
        downtime[src][i] += mttr * 60
    incidents.sort(key=lambda x: x["day"])
    for k, inc in enumerate(incidents):
        inc["id"] = f"INC-{k + 1:03d}"
        inc["status"] = "Resolved"
    if incidents:
        incidents[-1]["status"] = "Monitoring"

    availability = {}
    for s in sources:
        noise = rng.uniform(0, 4, len(days))  # minor blips, minutes
        availability[s] = [round(100 * (1 - min(1440, downtime[s][i] + noise[i]) / 1440), 2) for i in range(len(days))]
    months = sorted({d[:7] for d in days})
    sla = []
    for m in months:
        idx = [i for i, d in enumerate(days) if d.startswith(m)]
        v = np.mean([np.mean([availability[s][i] for i in idx]) for s in sources])
        sla.append(dict(month=m, availability=round(float(v), 2)))

    runs = []
    for i, day in enumerate(days):
        rows = sum(ds["daily"][i]["total"] for ds in rep["datasets"].values())
        quar = sum(ds["daily"][i]["quarantined"] for ds in rep["datasets"].values())
        status = "Succeeded"
        if quar / rows > 0.03:
            status = "Succeeded with quarantine"
        if downtime["pipeline"][i] > 0:
            status = "Recovered after retry"
        runs.append(dict(day=day, rows=int(rows), quarantined=int(quar),
                         duration_s=round(rows / 2600 + rng.uniform(4, 9), 1), status=status))
    mttr_before = [x["mttr_h"] for x in incidents if days.index(x["day"]) < first_iv]
    mttr_after = [x["mttr_h"] for x in incidents if days.index(x["day"]) >= first_iv]
    return dict(sources=sources, availability=availability, sla=sla, sla_target=98.0,
                incidents=incidents, runs=runs,
                mttr_before=_round(np.mean(mttr_before) if mttr_before else None, 1),
                mttr_after=_round(np.mean(mttr_after) if mttr_after else None, 1))


def build_lineage(rep: dict, programme: dict) -> dict:
    nodes, edges = [], []
    for name, ds in rep["datasets"].items():
        nodes.append(dict(id=f"src:{name}", label=ds["meta"]["source_system"], layer="source"))
        nodes.append(dict(id=f"bronze:{name}", label=name, layer="bronze"))
        nodes.append(dict(id=f"silver:{name}", label=name, layer="silver"))
        edges += [(f"src:{name}", f"bronze:{name}"), (f"bronze:{name}", f"silver:{name}"),
                  (f"silver:{name}", "gold:gold_daily")]
    nodes.append(dict(id="gold:gold_daily", label="gold_daily", layer="gold"))
    for k in programme["glossary"]:
        nodes.append(dict(id=f"kpi:{k['kpi']}", label=k["kpi"], layer="kpi"))
        edges.append(("gold:gold_daily", f"kpi:{k['kpi']}"))
    return dict(nodes=nodes, edges=[dict(source=a, target=b) for a, b in edges])


def _clean(o):
    """Make the bundle strict JSON: NaN/inf become null, numpy scalars become Python."""
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, np.generic):
        o = o.item()
    if isinstance(o, float) and not math.isfinite(o):
        return None
    return o


def main():
    rng = np.random.default_rng(7)
    bronze = generate_all()
    DB_DIR.mkdir(exist_ok=True)
    bundle = {"generated_at": dt.datetime(2026, 11, 1, 6, 0).isoformat(),
              "period": {"start": START.strftime("%Y-%m-%d"),
                         "end": (START + dt.timedelta(days=DAYS - 1)).strftime("%Y-%m-%d"), "days": DAYS},
              "framework": yaml.safe_load((ROOT / "governance" / "framework.yml").read_text()),
              "valuechain": yaml.safe_load((ROOT / "governance" / "valuechain.yml").read_text()),
              "domains": {}}
    for domain in ("oil_gas", "mining"):
        rep = run_domain(domain, bronze[domain], DB_DIR / f"{domain}.db")
        programme = yaml.safe_load((PROGRAMME / f"{domain}.yml").read_text())
        trust, dims = score_trust(rep)
        days = list(trust["day"])

        # per-rule weekly failure rate, before/after the first intervention
        rd = pd.DataFrame(rep["rule_daily"])
        first_iv = rep["contract"]["interventions"][0]["day"]
        rules_out = []
        for r in rep["rules"]:
            x = rd[rd["rule_id"] == r["id"]].reset_index(drop=True)
            rate = x["failed"] / x["total"] * 100
            before = x[x.index < first_iv]
            after = x[x.index >= len(x) - 21]
            rules_out.append(dict(**r, weekly=[round(v, 3) for v in weekly(rate)],
                                  before_pct=_round(before["failed"].sum() / before["total"].sum() * 100, 2),
                                  after_pct=_round(after["failed"].sum() / after["total"].sum() * 100, 2)))
        gold = rep["gold"].replace({np.nan: None})
        datasets = []
        for name, ds in rep["datasets"].items():
            datasets.append(dict(name=name, **ds))

        bundle["domains"][domain] = dict(
            site=rep["contract"]["site"], description=rep["contract"]["description"],
            reconciliation=rep["contract"]["reconciliation"],
            interventions=rep["contract"]["interventions"],
            gold=gold.to_dict("records"),
            trust=[dict(day=d, trust=_round(t, 1), pass_rate=_round(p, 2), recon_score=_round(r, 1))
                   for d, t, p, r in zip(days, trust["trust"], trust["pass_rate"], trust["recon_score"])],
            dimensions={dname: [_round(v, 2) for v in dims[dname]] for dname in DIMENSIONS if dname in dims},
            datasets=datasets, rules=rules_out,
            quarantine_samples=rep["quarantine_samples"],
            lineage=build_lineage(rep, programme),
            glossary=programme["glossary"], raci=programme["raci"],
            transformation=programme["transformation"], change=programme["change"],
            goal_tree=programme["goal_tree"], layers=programme["layers"], maturity=programme["maturity"],
            adoption=build_adoption(domain, trust, rng),
            ops=build_ops(domain, rep, rng),
        )
        print(f"{domain}: trust {trust['trust'].iloc[:7].mean():.1f} -> {trust['trust'].iloc[-7:].mean():.1f}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(_clean(bundle), default=str, separators=(",", ":"), allow_nan=False))
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
