-- v_stock_tanques: exponer el balance real y marcar el descuadre.
--
-- Hasta ahora la vista solo publicaba stock_actual envuelto en GREATEST(0, ...),
-- asi que un tanque con mas salidas que entradas se veia igual que un tanque
-- legitimamente vacio: el descuadre existia en los datos pero era imposible
-- detectarlo desde la aplicacion.
--
-- stock_actual se mantiene con el mismo significado y el mismo recorte a cero,
-- para que ninguna pantalla cambie de comportamiento. Se anaden tres columnas
-- nuevas de solo lectura:
--
--   balance_real     litros_iniciales + entradas - salidas, sin recortar.
--                    Negativo = se despacho mas de lo que entro.
--   descuadre        true cuando balance_real < 0.
--   litros_descuadre magnitud del faltante (0 cuando no hay descuadre), para
--                    poder ordenar las alertas por gravedad.
--
-- La logica de entradas y salidas es identica a la version anterior: no se
-- corrige aqui ni la separacion por combustible del trigger ni el filtro por
-- texto de la referencia, para que este cambio sea puramente aditivo.

DROP VIEW IF EXISTS v_stock_tanques;

CREATE VIEW v_stock_tanques AS
SELECT
  b.consumidor_id,
  b.nombre,
  b.categoria,
  b.combustible_id,
  b.combustible_nombre,
  GREATEST(0, b.balance_real)                                        AS stock_actual,
  b.balance_real,
  (b.balance_real < 0)                                               AS descuadre,
  CASE WHEN b.balance_real < 0 THEN -b.balance_real ELSE 0 END        AS litros_descuadre,
  b.litros_iniciales,
  b.total_entradas,
  b.total_salidas
FROM (
  SELECT
    c.id                        AS consumidor_id,
    c.nombre,
    c.categoria,
    c.combustible_id,
    c.combustible_nombre,
    COALESCE(c.litros_iniciales, 0) AS litros_iniciales,
    COALESCE(e.total, 0)            AS total_entradas,
    COALESCE(s.total, 0)            AS total_salidas,
    COALESCE(c.litros_iniciales, 0) + COALESCE(e.total, 0) - COALESCE(s.total, 0) AS balance_real
  FROM consumidor c
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(m.litros),0) AS total FROM movimiento m
    WHERE m.consumidor_id = c.id
      AND (m.tipo IN ('COMPRA','DEPOSITO') OR (m.tipo='DESPACHO' AND (m.referencia IS NULL OR m.referencia NOT ILIKE 'Bonificación combustible:%')))
      AND (c.combustible_id IS NULL OR m.combustible_id IS NULL OR m.combustible_id = c.combustible_id)
  ) e ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(sub.litros),0) AS total FROM (
      SELECT m.litros FROM movimiento m
      WHERE m.tipo='DESPACHO' AND m.consumidor_origen_id = c.id
        AND (c.combustible_id IS NULL OR m.combustible_id IS NULL OR m.combustible_id = c.combustible_id)
      UNION ALL
      SELECT m.litros FROM movimiento m
      WHERE c.categoria='surtidor' AND m.tipo='COMPRA'
        AND (
          (jsonb_typeof(c.datos_tanque->'tarjetas_vinculadas_ids')='array'
            AND m.tarjeta_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(c.datos_tanque->'tarjetas_vinculadas_ids'))))
          OR ((c.datos_tanque->'tarjetas_vinculadas_ids') IS NULL
            AND m.tarjeta_id::text = (c.datos_tanque->>'tarjeta_vinculada_id'))
        )
        AND (c.combustible_id IS NULL OR m.combustible_id IS NULL OR m.combustible_id = c.combustible_id)
    ) sub
  ) s ON true
  WHERE c.activo IS NOT FALSE AND c.categoria IN ('deposito','surtidor')
) b;

COMMENT ON VIEW v_stock_tanques IS
  'Stock por tanque/surtidor. stock_actual va recortado a 0 para la interfaz; balance_real lo muestra sin recortar y descuadre marca cuando es negativo.';


-- ─────────────────────────────────────────────────────────────
--  DIAGNOSTICO: ejecutar despues de crear la vista.
--  Lista los descuadres que hasta ahora quedaban ocultos.
--  Si devuelve 0 filas, el inventario esta cuadrado.
-- ─────────────────────────────────────────────────────────────
-- SELECT nombre, combustible_nombre, litros_iniciales, total_entradas,
--        total_salidas, balance_real, litros_descuadre
-- FROM v_stock_tanques
-- WHERE descuadre
-- ORDER BY litros_descuadre DESC;
