# Architecture

## Design principles

1. **Contracts before code.** Every dataset is declared in YAML with an owner, a steward, a freshness SLA, a grain, a primary key and its quality rules. The pipeline and the governance catalogue both read the same file, so documentation cannot drift from what runs.
2. **Never patch downstream.** Bad rows are quarantined with the rule IDs they broke and routed to the owner of the source. Gold tables read silver only.
3. **Unknown is not valid.** Each rule predicate is wrapped in `COALESCE(..., 0)`, so a NULL fails the rule instead of slipping through.
4. **Measure trust, then adoption.** A KPI is labelled decision-grade (trust ≥ 90), use with caution (75–90) or not decision-grade (< 75), so users know when to act on it.
5. **Fit for purpose.** Python, SQL and a static web app. It runs on a laptop in seconds and ports to PostgreSQL and an orchestrator without redesign.

## Layers

| Layer | Where | What happens |
|---|---|---|
| Source | `pipeline/generate.py` | Synthetic source systems with realistic defect patterns that change after each intervention |
| Bronze | `bronze_<dataset>` | Raw rows as received, including `ingest_ts` |
| Staging | `pipeline/sql/stage/*.sql` | Derived fields the rules need: `day`, `lag_minutes`, `dup_rank` (window function) |
| Checked | `checked_<dataset>` | One `f_<rule_id>` failure column per rule |
| Silver | `silver_<dataset>` | Rows passing all blocking rules; `dq_flag = 1` if any warning rule failed |
| Quarantine | `quarantine_<dataset>` | Rows failing a blocking rule, with `failed_rules` |
| Gold | `pipeline/sql/gold/<domain>_daily.sql` | One row per day of business KPIs, built from silver |
| Publish | `app/data/fieldtrust.json` | Gold, trust, dimensions, rules, catalogue, ops, programme and adoption for the web app |

## Scoring

- **Rule pass rate (daily):** mean across datasets of clean rows ÷ total rows.
- **Reconciliation score:** 100 when the cross-source gap is inside tolerance (2%), falling linearly to 0 at 2.5 × tolerance.
- **Data trust score:** 0.7 × pass rate + 0.3 × reconciliation score.
- **Dimension scores:** share of rule checks passing per dimension (completeness, validity, uniqueness, timeliness). Consistency is the reconciliation score.

## Operations model

- Availability per source per day comes from simulated outage events. The SLA target is 98%.
- The rule engine raises a *Data quality breach* incident when a dataset's daily quarantine rate exceeds 2.5× its median (minimum 2%).
- MTTR is reported before and after the first intervention to show maturity of the run model.

## Adoption model

Weekly adoption per user group moves toward a target that depends on the trust score two weeks earlier, with group-specific baselines and sensitivity, plus noise. This is a simulation of a pattern observed in the field: people adopt a system after its data has earned their trust. It is not presented as a measured result.

## Porting to production

| Here | Production equivalent |
|---|---|
| SQLite | PostgreSQL / PostGIS, or a lakehouse (Databricks, Fabric) |
| `run.py` | Orchestrator (Airflow, Dagster, ADF) with one task per dataset |
| Synthetic generator | Historian / FMS / LIMS connectors, MQTT for streaming telemetry |
| YAML rules | Same contracts, executed by the engine or by dbt tests / Great Expectations |
| Static JSON | API layer (FastAPI / Supabase) over gold tables |
