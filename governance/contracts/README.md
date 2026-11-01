# Data contracts

One YAML file per domain pack. Each dataset declares its owners, freshness SLA, grain, primary key and quality rules.
`pipeline/medallion.py` enforces these rules, and the web app's governance catalogue is generated from the same files.
