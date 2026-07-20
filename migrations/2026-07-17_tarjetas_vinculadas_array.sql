-- Migración: tarjeta_vinculada_id (string) → tarjetas_vinculadas_ids (array JSON)
-- Los surtidores con tarjeta_vinculada_id existente se convierten al nuevo formato.
-- El campo viejo se mantiene para compatibilidad con la vista (OR en el WHERE).

UPDATE consumidor
SET datos_tanque = jsonb_set(
  datos_tanque,
  '{tarjetas_vinculadas_ids}',
  jsonb_build_array(datos_tanque->>'tarjeta_vinculada_id')
)
WHERE categoria = 'surtidor'
  AND datos_tanque->>'tarjeta_vinculada_id' IS NOT NULL
  AND datos_tanque->>'tarjeta_vinculada_id' != ''
  AND (datos_tanque->'tarjetas_vinculadas_ids') IS NULL;

-- Re-crear la vista con soporte para array + campo legacy
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

    -- COMPRAs via tarjetas vinculadas (soporta array nuevo y campo legacy)
    SELECT m.litros
    FROM movimiento m
    WHERE c.categoria = 'surtidor'
      AND m.tipo = 'COMPRA'
      AND (
        (
          jsonb_typeof(c.datos_tanque->'tarjetas_vinculadas_ids') = 'array'
          AND m.tarjeta_id::text = ANY(
            ARRAY(SELECT jsonb_array_elements_text(c.datos_tanque->'tarjetas_vinculadas_ids'))
          )
        )
        OR (
          (c.datos_tanque->'tarjetas_vinculadas_ids') IS NULL
          AND m.tarjeta_id::text = (c.datos_tanque ->> 'tarjeta_vinculada_id')
        )
      )
      AND (
        c.combustible_id IS NULL
        OR m.combustible_id IS NULL
        OR m.combustible_id = c.combustible_id
      )
  ) sub
) s ON true

WHERE c.activo IS NOT FALSE
  AND c.categoria IN ('deposito', 'surtidor');
