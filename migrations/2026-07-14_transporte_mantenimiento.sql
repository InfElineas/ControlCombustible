-- Módulo de gestión de transporte: mantenimiento y vencimientos
-- Campos nuevos en consumidor (vehículos)
ALTER TABLE consumidor
  ADD COLUMN IF NOT EXISTS km_ultimo_mantenimiento    INTEGER,
  ADD COLUMN IF NOT EXISTS km_proximo_mantenimiento   INTEGER,
  ADD COLUMN IF NOT EXISTS tipo_ultimo_mantenimiento  SMALLINT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fecha_ultimo_mantenimiento DATE,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento_somaton  DATE,
  ADD COLUMN IF NOT EXISTS num_licencia_op            TEXT,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento_licencia_op DATE;

-- Historial de mantenimientos realizados
CREATE TABLE IF NOT EXISTS historial_mantenimiento (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  consumidor_id  UUID        NOT NULL REFERENCES consumidor(id) ON DELETE CASCADE,
  fecha          DATE        NOT NULL,
  km_en_servicio INTEGER     NOT NULL,
  km_proximo     INTEGER     NOT NULL,
  tipo           SMALLINT    NOT NULL DEFAULT 1,
  notas          TEXT,
  created_by     UUID        REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE historial_mantenimiento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hm_select_all"   ON historial_mantenimiento FOR SELECT USING (true);
CREATE POLICY "hm_insert_auth"  ON historial_mantenimiento FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "hm_delete_auth"  ON historial_mantenimiento FOR DELETE USING (auth.uid() IS NOT NULL);

-- Vista: estado de vehículos para el módulo de transporte
DROP VIEW IF EXISTS v_vehiculos_transporte;
CREATE VIEW v_vehiculos_transporte AS
SELECT
  c.id,
  c.nombre,
  c.codigo_interno,
  c.conductor AS conductor_nombre,
  c.km_ultimo_mantenimiento,
  c.km_proximo_mantenimiento,
  c.tipo_ultimo_mantenimiento,
  c.fecha_ultimo_mantenimiento,
  c.fecha_vencimiento_somaton,
  c.num_licencia_op,
  c.fecha_vencimiento_licencia_op,
  COALESCE(MAX(m.odometro), 0)::INTEGER AS km_actual
FROM consumidor c
LEFT JOIN movimiento m ON m.consumidor_id = c.id AND m.odometro IS NOT NULL
WHERE c.activo IS NOT FALSE
  AND c.categoria = 'consumidor'
GROUP BY c.id;
