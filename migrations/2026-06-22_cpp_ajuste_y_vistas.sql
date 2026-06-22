-- CPP ajuste manual + vistas corregidas
-- Fecha: 2026-06-22

-- 1. Tabla de ajustes manuales de CPP por tanque ISO
CREATE TABLE IF NOT EXISTS cpp_ajuste (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumidor_id UUID NOT NULL REFERENCES consumidor(id),
  cpp_manual    NUMERIC(10,4) NOT NULL,
  motivo        TEXT,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cpp_ajuste ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cpp_ajuste_select"     ON cpp_ajuste;
DROP POLICY IF EXISTS "cpp_ajuste_manage_eco" ON cpp_ajuste;
CREATE POLICY "cpp_ajuste_select"     ON cpp_ajuste FOR SELECT TO authenticated USING (true);
CREATE POLICY "cpp_ajuste_manage_eco" ON cpp_ajuste FOR ALL    TO authenticated
  USING     (get_my_role() IN ('superadmin', 'economico'))
  WITH CHECK (get_my_role() IN ('superadmin', 'economico'));

-- 2. v_cpp_por_tanque corregida:
--    - Solo DEPOSITO (no COMPRA)
--    - Si existe ajuste manual, lo usa; si no, calcula desde depósitos
CREATE OR REPLACE VIEW v_cpp_por_tanque AS
SELECT
  base.consumidor_id,
  COALESCE(
    (SELECT ca.cpp_manual
       FROM cpp_ajuste ca
      WHERE ca.consumidor_id = base.consumidor_id
      ORDER BY ca.fecha DESC, ca.created_at DESC
      LIMIT 1),
    base.cpp_calc
  ) AS cpp,
  base.cpp_calc,
  base.num_entradas,
  base.litros_con_precio
FROM (
  SELECT
    consumidor_id,
    SUM(litros * precio_costo_unitario) / NULLIF(SUM(litros), 0) AS cpp_calc,
    COUNT(*) AS num_entradas,
    SUM(litros) AS litros_con_precio
  FROM movimiento
  WHERE tipo = 'DEPOSITO'
    AND precio_costo_unitario IS NOT NULL
  GROUP BY consumidor_id
) base;

-- 3. v_cpp_por_combustible: CPP promedio ponderado por tipo de combustible
--    Se usa para valorar las COMPRAs de vehículos como gasto
CREATE OR REPLACE VIEW v_cpp_por_combustible AS
SELECT
  c.combustible_id,
  SUM(m.litros * m.precio_costo_unitario) / NULLIF(SUM(m.litros), 0) AS cpp
FROM movimiento m
JOIN consumidor c ON c.id = m.consumidor_id
WHERE m.tipo = 'DEPOSITO'
  AND m.precio_costo_unitario IS NOT NULL
  AND c.combustible_id IS NOT NULL
GROUP BY c.combustible_id;
