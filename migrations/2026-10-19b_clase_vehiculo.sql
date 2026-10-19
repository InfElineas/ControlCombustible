-- Clases de vehiculo para las tarifas de transportacion.
--
-- Corrige 2026-10-19_tarifa_transporte.sql, que colgaba la tarifa de
-- tipo_consumidor por un error de lectura mio. tipo_consumidor responde a otra
-- pregunta —que clase de cosa consume combustible: ISO TANQUE, Reserva,
-- Surtidor, Uso de almacen— y por eso el desplegable ofrecia justo lo que no
-- era. Triciclo, carro, camion y rastra no existian en ninguna tabla.
--
-- Son dos clasificaciones distintas del mismo parque y las dos hacen falta: un
-- camion es «Vehiculo» para el control de combustible y «Camion» para la
-- tarifa por kilometro.

CREATE TABLE IF NOT EXISTS clase_vehiculo (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       TEXT NOT NULL UNIQUE,
  orden        SMALLINT NOT NULL DEFAULT 0,
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Las cuatro que ya se usan a mano. El orden es de menor a mayor porte, que es
-- como se leen en la tabla de tarifas.
INSERT INTO clase_vehiculo (nombre, orden) VALUES
  ('Triciclo', 1), ('Carro', 2), ('Camión', 3), ('Rastra', 4)
ON CONFLICT (nombre) DO NOTHING;

ALTER TABLE clase_vehiculo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clase_vehiculo_select_all" ON clase_vehiculo;
DROP POLICY IF EXISTS "clase_vehiculo_write_eco"  ON clase_vehiculo;
CREATE POLICY "clase_vehiculo_select_all" ON clase_vehiculo
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "clase_vehiculo_write_eco" ON clase_vehiculo
  FOR ALL TO authenticated
  USING (get_my_role() IN ('superadmin', 'economico'))
  WITH CHECK (get_my_role() IN ('superadmin', 'economico'));

-- ── La tarifa pasa a colgar de la clase ───────────────────────────────────
ALTER TABLE tarifa_transporte
  ADD COLUMN IF NOT EXISTS clase_vehiculo_id UUID REFERENCES clase_vehiculo(id) ON DELETE CASCADE;

-- La columna vieja solo se retira si no hay nada que perder. Si alguien alcanzo
-- a cargar tarifas, se para aqui y se avisa: reasignarlas a ojo seria inventar
-- a que clase pertenece cada una.
DO $$
DECLARE
  v_filas integer;
BEGIN
  SELECT count(*) INTO v_filas FROM tarifa_transporte;

  IF v_filas > 0 THEN
    RAISE NOTICE 'Hay % tarifa(s) cargadas con el tipo de consumidor antiguo.', v_filas;
    RAISE NOTICE 'Asigna su clase a mano y luego ejecuta:';
    RAISE NOTICE '  ALTER TABLE tarifa_transporte DROP COLUMN tipo_consumidor_id;';
    RAISE NOTICE '  ALTER TABLE tarifa_transporte ALTER COLUMN clase_vehiculo_id SET NOT NULL;';
    RETURN;
  END IF;

  ALTER TABLE tarifa_transporte DROP COLUMN IF EXISTS tipo_consumidor_id;
  ALTER TABLE tarifa_transporte ALTER COLUMN clase_vehiculo_id SET NOT NULL;
  RAISE NOTICE 'Tarifas reapuntadas a clase_vehiculo.';
END $$;

DROP INDEX IF EXISTS idx_tarifa_transporte_tipo;
DROP INDEX IF EXISTS idx_tarifa_transporte_vigente_unica;

CREATE INDEX IF NOT EXISTS idx_tarifa_transporte_clase
  ON tarifa_transporte (clase_vehiculo_id, fecha_desde DESC);

-- Una clase no puede tener dos tarifas abiertas a la vez: si no, «la tarifa
-- vigente» depende de cual se lea primero.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tarifa_transporte_vigente_unica
  ON tarifa_transporte (clase_vehiculo_id)
  WHERE fecha_hasta IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'clase_vehiculo'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clase_vehiculo;
  END IF;
END $$;
