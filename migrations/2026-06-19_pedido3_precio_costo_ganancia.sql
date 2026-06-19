-- Pedido 3: precio de costo por entrada, precio de venta al cobrar, CPP por tanque ISO
-- Fecha: 2026-06-19

-- 1. Tabla de conceptos de precio
CREATE TABLE IF NOT EXISTS concepto_precio (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  activo      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Semilla inicial de conceptos
INSERT INTO concepto_precio (nombre, descripcion) VALUES
  ('Uso logístico',           'Combustible para operaciones logísticas de la empresa'),
  ('Bonificación trabajador', 'Beneficio de combustible al personal'),
  ('Uso almacén',             'Combustible para equipos y maquinaria del almacén')
ON CONFLICT (nombre) DO NOTHING;

-- 2. tipo_consumidor recibe concepto_id
ALTER TABLE tipo_consumidor ADD COLUMN IF NOT EXISTS concepto_id UUID REFERENCES concepto_precio(id);

-- 3. precio_despacho_tipo recibe concepto_id (complementa tipo_consumidor_id existente)
ALTER TABLE precio_despacho_tipo ADD COLUMN IF NOT EXISTS concepto_id UUID REFERENCES concepto_precio(id);

-- 4. movimiento recibe precio de costo (solo aplica en COMPRA y DEPOSITO)
ALTER TABLE movimiento ADD COLUMN IF NOT EXISTS precio_costo_unitario NUMERIC(10,4);

-- 5. venta_trabajador recibe precio de venta real (registrado por cajero al cobrar)
ALTER TABLE venta_trabajador ADD COLUMN IF NOT EXISTS precio_venta_unitario NUMERIC(10,4);

-- 6. Vista: Costo Promedio Ponderado por tanque ISO
CREATE OR REPLACE VIEW v_cpp_por_tanque AS
SELECT
  consumidor_id,
  SUM(litros * precio_costo_unitario) /
    NULLIF(SUM(CASE WHEN precio_costo_unitario IS NOT NULL THEN litros ELSE 0 END), 0) AS cpp,
  COUNT(*) AS num_entradas,
  SUM(CASE WHEN precio_costo_unitario IS NOT NULL THEN litros ELSE 0 END) AS litros_con_precio
FROM movimiento
WHERE tipo IN ('COMPRA', 'DEPOSITO')
  AND precio_costo_unitario IS NOT NULL
GROUP BY consumidor_id;

-- 7. RLS para concepto_precio
ALTER TABLE concepto_precio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "concepto_select_all" ON concepto_precio;
DROP POLICY IF EXISTS "concepto_manage_eco" ON concepto_precio;
CREATE POLICY "concepto_select_all" ON concepto_precio
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "concepto_manage_eco" ON concepto_precio
  FOR ALL TO authenticated
  USING (get_my_role() IN ('superadmin', 'economico'))
  WITH CHECK (get_my_role() IN ('superadmin', 'economico'));
