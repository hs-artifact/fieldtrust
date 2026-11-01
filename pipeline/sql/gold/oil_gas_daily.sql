-- Gold: one row per production day, built only from silver (trusted) data.
WITH alloc AS (
    SELECT day, SUM(alloc_gas_mmscf) AS field_gas_mmscf, COUNT(*) AS wells_reported
    FROM silver_daily_production_report GROUP BY day
),
uptime AS (
    SELECT day, AVG(CASE WHEN gas_mmscfd > 0.1 THEN 1.0 ELSE 0.0 END) * 100 AS well_uptime_pct,
           AVG(whp_psi) AS avg_whp_psi
    FROM silver_historian_well_hourly GROUP BY day
)
SELECT f.day,
       ROUND(a.field_gas_mmscf, 2)                                   AS field_gas_mmscf,
       ROUND(f.export_gas_mmscf, 2)                                  AS export_gas_mmscf,
       a.wells_reported,
       ROUND(ABS(a.field_gas_mmscf - f.export_gas_mmscf)
             / f.export_gas_mmscf * 100, 2)                          AS recon_error_pct,
       ROUND(u.well_uptime_pct, 1)                                   AS well_uptime_pct,
       ROUND(u.avg_whp_psi, 0)                                       AS avg_whp_psi
FROM silver_fiscal_meter_daily f
LEFT JOIN alloc  a ON a.day = f.day
LEFT JOIN uptime u ON u.day = f.day
ORDER BY f.day
