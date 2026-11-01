-- OBU offline re-sync can resend the same cycle; keep the first arrival.
SELECT b.*,
       date(load_ts)                                          AS day,
       (julianday(ingest_ts) - julianday(dump_ts)) * 1440.0   AS lag_minutes,
       ROW_NUMBER() OVER (PARTITION BY cycle_id
                          ORDER BY ingest_ts)                 AS dup_rank
FROM bronze_fms_haul_cycles b
