-- Lag is measured from midnight after the production day; SLA is 10:00 (600 min).
SELECT b.*,
       prod_date                                                         AS day,
       (julianday(entered_at) - julianday(prod_date, '+1 day')) * 1440.0 AS lag_minutes,
       ROW_NUMBER() OVER (PARTITION BY well_id, prod_date
                          ORDER BY entered_at)                           AS dup_rank
FROM bronze_daily_production_report b
