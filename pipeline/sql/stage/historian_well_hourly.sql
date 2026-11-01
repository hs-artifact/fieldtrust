-- Stage: add the derived fields the quality rules need.
SELECT b.*,
       date(ts)                                              AS day,
       (julianday(ingest_ts) - julianday(ts)) * 1440.0       AS lag_minutes,
       ROW_NUMBER() OVER (PARTITION BY well_id, ts
                          ORDER BY ingest_ts)                AS dup_rank
FROM bronze_historian_well_hourly b
