-- Gold: one row per production day, built only from silver (trusted) data.
WITH haul AS (
    SELECT day, SUM(payload_t) AS tonnage_t, COUNT(*) AS cycles,
           AVG(cycle_min) AS avg_cycle_min, COUNT(DISTINCT truck_id) AS trucks_active
    FROM silver_fms_haul_cycles GROUP BY day
),
wim AS (
    SELECT day, AVG((net_t - ref_payload_t) / ref_payload_t) * 100 AS wim_bias_pct, COUNT(*) AS tickets
    FROM silver_wim_tickets WHERE ref_payload_t BETWEEN 20 AND 140 GROUP BY day
),
fat AS (
    SELECT day, COUNT(*) AS alerts,
           SUM(verdict = 'TP') AS tp, SUM(verdict = 'FP') AS fp
    FROM silver_fatigue_alerts GROUP BY day
)
SELECT h.day,
       ROUND(h.tonnage_t, 0)                          AS tonnage_t,
       h.cycles, h.trucks_active,
       ROUND(h.avg_cycle_min, 1)                      AS avg_cycle_min,
       ROUND(w.wim_bias_pct, 2)                       AS wim_bias_pct,
       ROUND(ABS(w.wim_bias_pct), 2)                  AS recon_error_pct,
       f.alerts, f.tp, f.fp,
       ROUND(f.tp * 100.0 / NULLIF(f.tp + f.fp, 0), 1) AS fatigue_precision_pct
FROM haul h
LEFT JOIN wim w ON w.day = h.day
LEFT JOIN fat f ON f.day = h.day
ORDER BY h.day
