-- El ajuste manual de CPP no llegaba a aplicarse si el tanque no tenia ya algun
-- deposito con precio de costo.
--
-- La vista partia de una subconsulta que solo incluye movimientos DEPOSITO con
-- precio_costo_unitario informado, y encima de esas filas aplicaba el
-- COALESCE con el ajuste manual. Si un tanque no tenia ningun deposito con
-- costo no habia fila base, asi que el ajuste se guardaba en cpp_ajuste y la
-- vista seguia sin devolver nada: la columna de ganancia quedaba vacia y el
-- ajuste parecia no hacer efecto.
--
-- Ahora se parte del consumidor y tanto el calculo como el ajuste se enganchan
-- por LEFT JOIN, de modo que basta con cualquiera de los dos. Se conserva
-- cpp_calc aparte para poder distinguir el costo real del fijado a mano, y la
-- vista sigue devolviendo solo los tanques que tienen algun CPP.

CREATE OR REPLACE VIEW v_cpp_por_tanque AS
SELECT
  c.id AS consumidor_id,
  COALESCE(aj.cpp_manual, base.cpp_calc)      AS cpp,
  base.cpp_calc,
  (aj.cpp_manual IS NOT NULL)                 AS cpp_es_manual,
  COALESCE(base.num_entradas, 0)              AS num_entradas,
  COALESCE(base.litros_con_precio, 0)         AS litros_con_precio
FROM consumidor c
LEFT JOIN LATERAL (
  SELECT ca.cpp_manual
  FROM cpp_ajuste ca
  WHERE ca.consumidor_id = c.id
  ORDER BY ca.fecha DESC, ca.created_at DESC
  LIMIT 1
) aj ON true
LEFT JOIN (
  SELECT
    consumidor_id,
    SUM(litros * precio_costo_unitario) / NULLIF(SUM(litros), 0) AS cpp_calc,
    COUNT(*)    AS num_entradas,
    SUM(litros) AS litros_con_precio
  FROM movimiento
  WHERE tipo = 'DEPOSITO' AND precio_costo_unitario IS NOT NULL
  GROUP BY consumidor_id
) base ON base.consumidor_id = c.id
WHERE aj.cpp_manual IS NOT NULL OR base.consumidor_id IS NOT NULL;

COMMENT ON VIEW v_cpp_por_tanque IS
  'Costo promedio ponderado por tanque. cpp es el ajuste manual si existe y si no el calculado a partir de los depositos con precio de costo; cpp_es_manual indica cual de los dos se esta usando.';
