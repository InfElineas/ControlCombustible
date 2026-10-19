-- Tarifas de referencia de transportacion: $/km por tipo de vehiculo.
--
-- Etapa 1 de DISENO-FICHAS-COSTO.md. Es la tabla que hoy se lleva a mano
-- (triciclo 0.5, carro 1, camion 1.5, rastra 2) y con la que se da una oferta
-- rapida antes de calcular la ficha completa.
--
-- Con vigencia por fechas y no con un valor unico que se sobrescribe: una ficha
-- de marzo tiene que seguir enseñando la tarifa de marzo cuando se consulte en
-- diciembre. Mismo patron que precio_despacho_tipo, que ya funciona asi.
--
-- El tipo de vehiculo sale de tipo_consumidor, que ya agrupa camiones, equipos
-- y demas. No hace falta un catalogo nuevo.

CREATE TABLE IF NOT EXISTS tarifa_transporte (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_consumidor_id UUID NOT NULL REFERENCES tipo_consumidor(id) ON DELETE CASCADE,
  precio_km          NUMERIC(12,4) NOT NULL CHECK (precio_km >= 0),
  moneda             TEXT NOT NULL DEFAULT 'CUP',
  fecha_desde        DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_hasta        DATE,
  notas              TEXT,
  created_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creada_por         UUID,
  creada_por_email   TEXT,
  CONSTRAINT tarifa_transporte_rango CHECK (fecha_hasta IS NULL OR fecha_hasta >= fecha_desde)
);

CREATE INDEX IF NOT EXISTS idx_tarifa_transporte_tipo
  ON tarifa_transporte (tipo_consumidor_id, fecha_desde DESC);

-- Un tipo de vehiculo no puede tener dos tarifas abiertas a la vez: al poner
-- una nueva hay que cerrar la anterior. Si no, «la tarifa vigente» depende de
-- cual se lea primero.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tarifa_transporte_vigente_unica
  ON tarifa_transporte (tipo_consumidor_id)
  WHERE fecha_hasta IS NULL;

ALTER TABLE tarifa_transporte ENABLE ROW LEVEL SECURITY;

-- La consulta la necesita cualquiera que prepare una oferta; mantenerla es del
-- rol que elabora las fichas, que es el mismo que lleva los precios.
DROP POLICY IF EXISTS "tarifa_transporte_select_all" ON tarifa_transporte;
DROP POLICY IF EXISTS "tarifa_transporte_insert_eco" ON tarifa_transporte;
DROP POLICY IF EXISTS "tarifa_transporte_update_eco" ON tarifa_transporte;
DROP POLICY IF EXISTS "tarifa_transporte_delete_eco" ON tarifa_transporte;

CREATE POLICY "tarifa_transporte_select_all" ON tarifa_transporte
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tarifa_transporte_insert_eco" ON tarifa_transporte
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('superadmin', 'economico'));
CREATE POLICY "tarifa_transporte_update_eco" ON tarifa_transporte
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('superadmin', 'economico'))
  WITH CHECK (get_my_role() IN ('superadmin', 'economico'));
CREATE POLICY "tarifa_transporte_delete_eco" ON tarifa_transporte
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('superadmin', 'economico'));

-- Propagacion en tiempo real, como el resto de catalogos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tarifa_transporte'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tarifa_transporte;
  END IF;
END $$;
