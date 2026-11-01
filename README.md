# FieldTrust

**An operational data trust platform for oil & gas and mining.**
Field reality → trusted data → decisions → adoption.

> "If it doesn't work at 3 AM on night shift, it doesn't work."

Most digital programmes in heavy industry rarely fail on technology. They fail on untrusted data, unclear ownership, and systems that never get accepted on site. FieldTrust is a working model of how to close that gap. It brings five disciplines together in one product:

| Discipline | What you can see in FieldTrust |
|---|---|
| **Data engineering** | Contract-driven medallion pipeline (bronze → silver → gold), quarantine, reproducible daily runs |
| **Data governance** | Owners and stewards per dataset, KPI glossary, RACI, lineage from source to KPI |
| **Data quality** | Five dimensions scored daily, a rule catalogue with SQL predicates, before/after evidence |
| **Digital operations** | 24×7 source monitoring, SLA against target, incidents raised by the rule engine, MTTR, runbook |
| **Transformation & change** | Requirement → acceptance → evidence stage gates, ADKAR by user group, stakeholder map, adoption tied to trust |

Two domain packs run on the same core:

- **Kestrel Gas Field (oil & gas):** 12 wells, process historian, daily production report, fiscal export meter
- **Ridgeback Pit (mining):** 40 haul trucks, fleet management cycles, weigh-in-motion, fatigue alerts

All sites, people and figures are fictional. All data is synthetic.

---

## The story in the data

Each domain starts with the kinds of defects real field data carries. Programme interventions fix them at source:

1. **Technology:** fix the instrument or interface (unit mapping on historian tags, WIM loadcell calibration)
2. **Process:** change how data is captured (a validated digital daily report, fatigue threshold tuning)
3. **People:** assign ownership and coach supervisors (RACI sign-off, ADKAR reinforcement)

The data trust score rises after each fix. Adoption follows about two weeks later. FieldTrust measures that link as a correlation between weekly trust and adoption.

## Quick start

```bash
pip install -r requirements.txt
python pipeline/run.py            # generate → validate → score → publish JSON
python -m http.server -d app 8000 # open http://localhost:8000
```

`pipeline/run.py` takes a few seconds. It rebuilds `app/data/fieldtrust.json` and writes SQLite databases to `data/` so you can query each layer:

```bash
sqlite3 data/mining.db "SELECT failed_rules, COUNT(*) FROM quarantine_fms_haul_cycles GROUP BY 1 ORDER BY 2 DESC;"
```

## How it works

```
governance/contracts/*.yml   ← owners, freshness SLAs, quality rules (SQL predicates)
          │
pipeline/generate.py         → bronze: raw synthetic source systems with realistic defects
pipeline/medallion.py        → staging SQL, rule engine, silver + quarantine, gold SQL
pipeline/run.py              → trust score, ops & incidents, adoption, JSON bundle
          │
app/                         ← static web app (vanilla JS + hand-built SVG), no build step
```

A quality rule is plain data:

```yaml
- id: OG-H-03
  dimension: validity
  severity: block
  description: Wellhead pressure within physical envelope (300-3000 psi); catches bar/psi unit mix-ups
  valid_when: whp_psi BETWEEN 300 AND 3000
```

The engine turns every rule into a SQL column (`CASE WHEN COALESCE((predicate), 0) THEN 0 ELSE 1 END`). Rows that fail a `block` rule go to quarantine with the IDs they broke. Rows that fail only `warn` rules are promoted with a flag. Gold KPIs read silver only.

**Data trust score** = 0.7 × rule pass rate + 0.3 × reconciliation score. Reconciliation compares independent sources: allocated well volumes against the fiscal meter, or WIM net weight against on-board payload.

See [docs/architecture.md](docs/architecture.md) for details and [docs/roadmap.md](docs/roadmap.md) for what comes next.

## Deploy

The `app/` folder is a static site. The included GitHub Actions workflow (`.github/workflows/pages.yml`) runs the pipeline and publishes `app/` to GitHub Pages on every push to `main`. In the repository go to **Settings → Pages → Source: GitHub Actions**.

## About

Built by **Hendro S.** ([hs-artifact](https://github.com/hs-artifact)): 15+ years across an international oil major, national upstream operators and large-scale open-pit coal mining, working at the point where operations, data, governance and people meet.

The domain model, quality rules, acceptance criteria and adoption logic come from that field experience. The code was written with AI-assisted development.

## License

MIT
