-- Catálogo de trabajadores beneficiarios de combustible
CREATE TABLE IF NOT EXISTS beneficiario (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre       TEXT        NOT NULL,
  ci           TEXT,
  area         TEXT,
  activo       BOOLEAN     NOT NULL DEFAULT true,
  observaciones TEXT,
  created_date TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beneficiario_nombre ON beneficiario(nombre);

ALTER TABLE beneficiario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "beneficiario_select" ON beneficiario FOR SELECT TO authenticated USING (true);
CREATE POLICY "beneficiario_insert" ON beneficiario FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('superadmin','operador','cajero','economico')));
CREATE POLICY "beneficiario_update" ON beneficiario FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('superadmin','operador','cajero','economico')));
CREATE POLICY "beneficiario_delete" ON beneficiario FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('superadmin')));

-- Ventas de combustible a trabajadores
CREATE TABLE IF NOT EXISTS venta_trabajador (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  beneficiario_id     UUID        NOT NULL REFERENCES beneficiario(id) ON DELETE RESTRICT,
  beneficiario_nombre TEXT        NOT NULL,                          -- desnormalizado
  beneficiario_ci     TEXT,
  beneficiario_area   TEXT,
  tanque_origen_id    UUID        NOT NULL REFERENCES consumidor(id) ON DELETE RESTRICT,
  tanque_origen_nombre TEXT       NOT NULL,
  combustible_id      UUID        NOT NULL REFERENCES tipo_combustible(id) ON DELETE RESTRICT,
  combustible_nombre  TEXT        NOT NULL,
  litros              NUMERIC(10,2) NOT NULL CHECK (litros > 0),
  precio_por_litro    NUMERIC(12,4) NOT NULL CHECK (precio_por_litro > 0),
  monto               NUMERIC(14,4) NOT NULL,
  moneda              TEXT        NOT NULL DEFAULT 'CUP',
  estado              TEXT        NOT NULL DEFAULT 'PENDIENTE'
                        CHECK (estado IN ('PENDIENTE','RETIRADO','PAGADO','ANULADO')),
  fecha_venta         DATE        NOT NULL,
  fecha_retiro        DATE,
  fecha_pago          DATE,
  registrado_por      UUID        REFERENCES auth.users(id),
  cobrado_por         UUID        REFERENCES auth.users(id),
  movimiento_id       UUID        REFERENCES movimiento(id) ON DELETE SET NULL,
  referencia          TEXT,
  created_date        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venta_trabajador_estado       ON venta_trabajador(estado);
CREATE INDEX IF NOT EXISTS idx_venta_trabajador_fecha        ON venta_trabajador(fecha_venta DESC);
CREATE INDEX IF NOT EXISTS idx_venta_trabajador_beneficiario ON venta_trabajador(beneficiario_id);
CREATE INDEX IF NOT EXISTS idx_venta_trabajador_tanque       ON venta_trabajador(tanque_origen_id, estado);

ALTER TABLE venta_trabajador ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venta_select" ON venta_trabajador FOR SELECT TO authenticated USING (true);
CREATE POLICY "venta_insert" ON venta_trabajador FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('superadmin','operador','cajero','economico')));
CREATE POLICY "venta_update" ON venta_trabajador FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('superadmin','operador','cajero','economico')));
CREATE POLICY "venta_delete" ON venta_trabajador FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('superadmin')));
