"""
Synthetic source-system generator (bronze layer).

Produces 90 days of raw operational data for two fictional sites, with the
kinds of defects real field data carries: missing values, bad tag quality,
unit mix-ups, decimal-shift typos, re-sync duplicates, late arrivals and
instrument bias. Defect rates drop after each programme intervention, so the
effect of fixing data at source is visible downstream.

Everything here is synthetic. No real asset, person or company data is used.
"""
from __future__ import annotations

import datetime as dt
import numpy as np
import pandas as pd

START = dt.datetime(2026, 8, 3)
DAYS = 90
SEED = 20261102


def _days():
    return [START + dt.timedelta(days=d) for d in range(DAYS)]


def _step(day: int, schedule: list[tuple[int, float]]) -> float:
    """Piecewise-constant rate: schedule = [(from_day, rate), ...] sorted."""
    rate = schedule[0][1]
    for start, r in schedule:
        if day >= start:
            rate = r
    return rate


# --------------------------------------------------------------------------
# Oil & Gas — Kestrel Gas Field
# --------------------------------------------------------------------------
def generate_oil_gas(rng: np.random.Generator) -> dict[str, pd.DataFrame]:
    wells = [f"W-{i:02d}" for i in range(1, 13)]
    base_rate = dict(zip(wells, rng.uniform(4.0, 11.0, len(wells))))
    base_whp = dict(zip(wells, rng.uniform(900, 1500, len(wells))))
    bar_wells = set(rng.choice(wells, 4, replace=False))  # unit bug until day 24

    hourly, daily, fiscal = [], [], []
    for d, day in enumerate(_days()):
        decline = 1 - 0.0009 * d
        p_missing = _step(d, [(0, 0.020), (24, 0.008), (66, 0.004)])
        p_bad = _step(d, [(0, 0.030), (24, 0.010), (66, 0.006)])
        p_dup = _step(d, [(0, 0.012), (24, 0.006), (66, 0.003)])
        p_late = _step(d, [(0, 0.10), (24, 0.05), (66, 0.03)])
        day_true = {}
        for w in wells:
            # planned/unplanned downtime hours
            down_hours = set()
            if rng.random() < 0.06:
                s = int(rng.integers(0, 20))
                down_hours = set(range(s, s + int(rng.integers(2, 8))))
            vol = 0.0
            for h in range(24):
                ts = day + dt.timedelta(hours=h)
                gas = 0.0 if h in down_hours else max(
                    0.0, base_rate[w] * decline * rng.normal(1, 0.035))
                vol += gas / 24
                whp = base_whp[w] * decline * rng.normal(1, 0.02)
                if gas == 0:
                    whp *= 1.08  # shut-in pressure build-up
                whp_out = whp
                if w in bar_wells and d < 24:
                    whp_out = whp / 14.5038  # exported in bar
                row = dict(
                    well_id=w, ts=ts,
                    whp_psi=round(whp_out, 1),
                    wht_c=round(rng.normal(74, 4), 1),
                    gas_mmscfd=round(gas, 3),
                    cond_bpd=round(gas * rng.normal(18, 1.2), 1),
                    water_bpd=round(gas * rng.normal(6, 0.8), 1),
                    quality_code="GOOD",
                )
                if rng.random() < p_missing:
                    row["gas_mmscfd"] = None
                if rng.random() < p_bad:
                    row["quality_code"] = rng.choice(["BAD", "STALE"])
                if rng.random() < 0.002:
                    row["gas_mmscfd"] = round(base_rate[w] * rng.uniform(3, 6), 3)  # spike
                lag = rng.uniform(80, 400) if rng.random() < p_late else rng.uniform(2, 25)
                row["ingest_ts"] = ts + dt.timedelta(minutes=float(lag))
                hourly.append(row)
                if rng.random() < p_dup:
                    dup = dict(row)
                    dup["ingest_ts"] = row["ingest_ts"] + dt.timedelta(minutes=30)
                    hourly.append(dup)
            day_true[w] = vol

        # daily production report (manual entry)
        p_typo = _step(d, [(0, 0.035), (52, 0.004)])
        p_rdup = _step(d, [(0, 0.030), (52, 0.002)])
        p_rlate = _step(d, [(0, 0.22), (52, 0.06), (66, 0.03)])
        p_rmiss = _step(d, [(0, 0.015), (52, 0.002)])
        for w in wells:
            alloc = day_true[w] * rng.normal(1, 0.006)
            val = round(alloc, 3)
            if rng.random() < p_typo:
                val = round(alloc * 10, 3)  # decimal shift
            if rng.random() < p_rmiss:
                val = None
            entered = day + dt.timedelta(days=1, hours=float(
                rng.uniform(11, 20) if rng.random() < p_rlate else rng.uniform(6, 9.5)))
            rec = dict(well_id=w, prod_date=day.date(), alloc_gas_mmscf=val,
                       alloc_cond_bbl=round(alloc * 18, 1),
                       entered_by=rng.choice(["Field Supervisor", "Production Technician"]),
                       entered_at=entered)
            daily.append(rec)
            if rng.random() < p_rdup:
                r2 = dict(rec)
                r2["entered_at"] = entered + dt.timedelta(hours=2)
                daily.append(r2)

        true_total = sum(day_true.values())
        fiscal.append(dict(prod_date=day.date(),
                           export_gas_mmscf=round(true_total * rng.normal(0.995, 0.003), 3)))

    return {
        "historian_well_hourly": pd.DataFrame(hourly),
        "daily_production_report": pd.DataFrame(daily),
        "fiscal_meter_daily": pd.DataFrame(fiscal),
    }


# --------------------------------------------------------------------------
# Mining — Ridgeback Pit
# --------------------------------------------------------------------------
def generate_mining(rng: np.random.Generator) -> dict[str, pd.DataFrame]:
    trucks = [f"HT-{i}" for i in range(101, 141)]
    truck_bias = dict(zip(trucks, rng.normal(0, 0.012, len(trucks))))
    cycles, wim, alerts = [], [], []
    cid = tid = aid = 0
    for d, day in enumerate(_days()):
        p_null = _step(d, [(0, 0.020), (63, 0.006)])
        p_oor = _step(d, [(0, 0.012), (63, 0.004)])
        p_dup = _step(d, [(0, 0.018), (63, 0.005)])
        p_late = _step(d, [(0, 0.09), (63, 0.04)])
        p_geo = _step(d, [(0, 0.010), (63, 0.006)])
        wim_bias = _step(d, [(0, 0.041), (20, 0.003)])
        wim_noise = _step(d, [(0, 0.022), (20, 0.007)])
        rain = rng.random() < 0.22  # wet-weather slowdown
        for t in trucks:
            if rng.random() < 0.07:  # truck down for maintenance
                continue
            n = int(rng.normal(17 if not rain else 13, 1.5))
            clock = day + dt.timedelta(hours=float(rng.uniform(0, 0.6)))
            for _ in range(max(n, 0)):
                cyc = max(9.0, rng.normal(38 if not rain else 47, 6))
                load_ts = clock
                dump_ts = load_ts + dt.timedelta(minutes=cyc * 0.55)
                clock = load_ts + dt.timedelta(minutes=cyc + rng.uniform(5, 30))
                if clock >= day + dt.timedelta(days=1):
                    break
                true_payload = rng.normal(96, 4.5)
                payload = true_payload * (1 + truck_bias[t])
                cid += 1
                row = dict(cycle_id=f"C{cid:07d}", truck_id=t,
                           shift="Day" if 6 <= load_ts.hour < 18 else "Night",
                           load_ts=load_ts, dump_ts=dump_ts,
                           payload_t=round(payload, 1), cycle_min=round(cyc, 1),
                           in_geofence=1)
                if rng.random() < p_null:
                    row["payload_t"] = None
                if rng.random() < p_oor:
                    row["payload_t"] = round(rng.choice([rng.uniform(0, 12), rng.uniform(150, 220)]), 1)
                if rng.random() < 0.004:
                    row["cycle_min"] = round(rng.choice([-rng.uniform(1, 30), rng.uniform(200, 600)]), 1)
                if rng.random() < p_geo:
                    row["in_geofence"] = 0
                lag = rng.uniform(40, 360) if rng.random() < p_late else rng.uniform(0.2, 6)
                row["ingest_ts"] = dump_ts + dt.timedelta(minutes=float(lag))
                cycles.append(row)
                if rng.random() < p_dup:
                    r2 = dict(row)
                    r2["ingest_ts"] = row["ingest_ts"] + dt.timedelta(minutes=float(rng.uniform(5, 90)))
                    cycles.append(r2)
                # ~35% of cycles route over the weighbridge
                if rng.random() < 0.35:
                    tid += 1
                    net = true_payload * (1 + wim_bias + rng.normal(0, wim_noise))
                    w = dict(ticket_id=f"T{tid:07d}", truck_id=t,
                             ts=dump_ts - dt.timedelta(minutes=4),
                             net_t=round(net, 1),
                             ref_payload_t=row["payload_t"] if row["payload_t"] is not None else None)
                    if rng.random() < 0.006:
                        w["net_t"] = None
                    wim.append(w)

        # fatigue alerts
        fp_rate = _step(d, [(0, 0.46), (48, 0.255)])
        n_alerts = int(rng.normal(30 if d < 48 else 22, 4))
        for _ in range(max(n_alerts, 0)):
            aid += 1
            hour = int(rng.choice(range(24), p=_fatigue_hour_profile()))
            ts = day + dt.timedelta(hours=hour, minutes=float(rng.uniform(0, 59)))
            verdict = "FP" if rng.random() < fp_rate else "TP"
            if rng.random() < _step(d, [(0, 0.05), (63, 0.01)]):
                verdict = None
            alerts.append(dict(alert_id=f"A{aid:06d}", truck_id=rng.choice(trucks), ts=ts,
                               shift="Day" if 6 <= hour < 18 else "Night", verdict=verdict))

    return {
        "fms_haul_cycles": pd.DataFrame(cycles),
        "wim_tickets": pd.DataFrame(wim),
        "fatigue_alerts": pd.DataFrame(alerts),
    }


def _fatigue_hour_profile():
    # alerts cluster in the circadian low (02:00-06:00) and post-lunch dip
    w = np.ones(24)
    w[2:6] = 3.2
    w[13:16] = 1.8
    return w / w.sum()


def generate_all() -> dict[str, dict[str, pd.DataFrame]]:
    rng = np.random.default_rng(SEED)
    return {"oil_gas": generate_oil_gas(rng), "mining": generate_mining(rng)}


if __name__ == "__main__":
    out = generate_all()
    for dom, tables in out.items():
        for name, df in tables.items():
            print(f"{dom:8s} {name:28s} {len(df):>8,d} rows")
