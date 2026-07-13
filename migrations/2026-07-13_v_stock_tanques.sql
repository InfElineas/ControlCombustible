-- Vista: stock actual por tanque calculado en PostgreSQL
-- Reemplaza el cálculo JS de calcStockTanque / stockDepositos en el frontend.
-- Reglas:
--   entradas = COMPRA + DEPOSITO + DESPACHO al tanque (excluyendo DESPACHOs de bonificación)
--   salidas  = DESPACHO desde el tanque + COMPRA via tarjeta_vinculada (surtidores)
--   filtro combustible_id: null en tanque o movimiento = cualquier combustible

DROP VIEW IF EXISTS v_stock_tanques;

CREATE VIEW v_stock_tanques AS
SELECT
  c.id                              AS consumidor_id,
  c.nombre,
  c.categoria,
  c.combustible_id,
  c.combustible_nombre,
  GREATEST(0,
    COALESCE(c.litros_iniciales, 0)
    + COALESCE(e.total, 0)
    - COALESCE(s.total, 0)
  )                                 AS stock_actual,
  COALESCE(c.litros_iniciales, 0)  AS litros_iniciales,
  COALESCE(e.total, 0)             AS total_entradas,
  COALESCE(s.total, 0)             AS total_salidas
FROM consumidor c

-- Entradas al tanque
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(m.litros), 0) AS total
  FROM movimiento m
  WHERE m.consumidor_id = c.id
    AND (
      m.tipo IN ('COMPRA', 'DEPOSITO')
      OR (
        m.tipo = 'DESPACHO'
        AND (m.referencia IS NULL OR m.referencia NOT ILIKE 'Bonificación combustible:%')
      )
    )
    AND (
      c.combustible_id IS NULL
      OR m.combustible_id IS NULL
      OR m.combustible_id = c.combustible_id
    )
) e ON true

-- Salidas desde el tanque
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(sub.litros), 0) AS total
  FROM (
    -- DESPACHOs desde este tanque como origen
    SELECT m.litros
    FROM movimiento m
    WHERE m.tipo = 'DESPACHO'
      AND m.consumidor_origen_id = c.id
      AND (
        c.combustible_id IS NULL
        OR m.combustible_id IS NULL
        OR m.combustible_id = c.combustible_id
      )

    UNION ALL

    -- COMPRAs via tarjeta vinculada (solo surtidores con tarjeta configurada)
    SELECT m.litros
    FROM movimiento m
    WHERE c.categoria = 'surtidor'
      AND (c.datos_tanque ->> 'tarjeta_vinculada_id') IS NOT NULL
      AND m.tipo = 'COMPRA'
      AND m.tarjeta_id::text = (c.datos_tanque ->> 'tarjeta_vinculada_id')
      AND (
        c.combustible_id IS NULL
        OR m.combustible_id IS NULL
        OR m.combustible_id = c.combustible_id
      )
  ) sub
) s ON true

WHERE c.activo IS NOT FALSE
  AND c.categoria IN ('deposito', 'surtidor');
